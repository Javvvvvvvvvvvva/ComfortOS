import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Feature, Polygon } from "geojson";
import { CachedBuildingProvider } from "@/lib/environment/buildings/cache";
import type { Building, BuildingProvider } from "@/lib/environment/buildings/types";
import {
  assertNoFixtureBuildingProviderInProduction,
  createConfiguredBuildingProvider,
} from "@/lib/environment/buildings/providers/configuredBuildingProvider";
import { HttpBuildingProvider } from "@/lib/environment/buildings/providers/httpBuildingProvider";
import {
  boundsForFootprint,
  LocalOvertureBuildingProvider,
} from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";
import { manifestIntersectsBounds } from "@/lib/environment/buildings/providers/multiRegionOvertureBuildingProvider";
import { normalizeOvertureFeature } from "@/scripts/ingest-overture-buildings";
import {
  assertEnvironmentServiceAuthentication,
  assertBboxWithinLimit,
  isAuthorizedServiceRequest,
  parseBuildingServiceBbox,
} from "@/scripts/serve-building-query-service";

test("normalizes Overture-like building features behind the Building model", () => {
  const [building] = normalizeOvertureFeature({
    type: "Feature",
    id: "fixture",
    properties: {
      id: "fixture",
      height: 12,
      num_floors: 4,
    },
    geometry: polygon([
      [-93.266, 44.977],
      [-93.265, 44.977],
      [-93.265, 44.978],
      [-93.266, 44.978],
    ]),
  } satisfies Feature);

  assert.equal(building.id, "overture:fixture");
  assert.equal(building.heightMeters, 12);
  assert.equal(building.heightSource, "provider");
  assert.equal(building.source, "Overture Maps Buildings");
  assert.ok(building.confidence > 0.8);
});

test("local Overture provider queries bbox through the tile index", async () => {
  const storeDir = await writeStore([
    sampleBuilding("inside", -93.266, 44.977),
    sampleBuilding("outside", -93.3, 45.01),
  ]);
  const provider = new LocalOvertureBuildingProvider({ storeDir });
  const buildings = await provider.getBuildings({
    west: -93.267,
    south: 44.976,
    east: -93.264,
    north: 44.979,
  });

  assert.equal(buildings.length, 1);
  assert.equal(buildings[0].id, "inside");
});

test("local Overture provider rejects a store with a mismatched checksum", async () => {
  const storeDir = await writeStore([sampleBuilding("inside", -93.266, 44.977)]);
  const manifestPath = path.join(storeDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<
    string,
    unknown
  >;
  manifest.checksums = {
    buildingsSha256: "0".repeat(64),
    tileIndexSha256: "0".repeat(64),
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");

  const provider = new LocalOvertureBuildingProvider({ storeDir });
  await assert.rejects(
    () =>
      provider.getBuildings({
        west: -93.267,
        south: 44.976,
        east: -93.264,
        north: 44.979,
      }),
    /checksum mismatch/,
  );
});

test("cached building provider records hits and does not cache failures", async () => {
  const provider = new CachedBuildingProvider(flakyProvider(), {
    ttlMs: 60_000,
    maxEntries: 4,
  });
  const bounds = { west: -93.267, south: 44.976, east: -93.264, north: 44.979 };

  await assert.rejects(() => provider.getBuildings(bounds), /temporary failure/);
  assert.deepEqual(provider.getStats(), { hits: 0, misses: 1, entries: 0 });

  const first = await provider.getBuildings(bounds);
  const second = await provider.getBuildings(bounds);

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.deepEqual(provider.getStats(), { hits: 1, misses: 2, entries: 1 });
});

test("production building provider config rejects fixture stores", () => {
  assert.throws(
    () =>
      assertNoFixtureBuildingProviderInProduction({
        nodeEnv: "production",
        mode: "local-overture",
        localStoreDir: "/app/fixtures/buildings",
      }),
    /Fixture building stores are prohibited/,
  );
});

test("explicit local Overture mode requires an explicit real store", () => {
  const originalProvider = process.env.BUILDING_PROVIDER;
  const originalStore = process.env.BUILDING_LOCAL_OVERTURE_STORE_DIR;

  try {
    process.env.BUILDING_PROVIDER = "local-overture";
    delete process.env.BUILDING_LOCAL_OVERTURE_STORE_DIR;

    assert.throws(
      () => createConfiguredBuildingProvider(),
      /BUILDING_LOCAL_OVERTURE_STORE_DIR is required/,
    );
  } finally {
    restoreEnv("BUILDING_PROVIDER", originalProvider);
    restoreEnv("BUILDING_LOCAL_OVERTURE_STORE_DIR", originalStore);
  }
});

test("HTTP building provider consumes normalized query-service buildings", async () => {
  const provider = new HttpBuildingProvider({
    baseUrl: "https://buildings.example.test",
    authToken: "service-secret",
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer service-secret");
      if (url.pathname === "/metadata") {
        return new Response(
          JSON.stringify({
            metadata: {
              provider: "Overture Maps",
              datasetVersion: "2026-07-22.0",
              region: "minneapolis-validation",
            },
          }),
          { status: 200 },
        );
      }
      assert.equal(url.pathname, "/buildings");
      assert.equal(url.searchParams.get("bbox"), "-93.267,44.976,-93.264,44.979");

      return new Response(
        JSON.stringify({
          metadata: {
            provider: "Overture Maps",
            datasetVersion: "2026-07-22.0",
            region: "minneapolis-validation",
          },
          buildings: [sampleBuilding("service", -93.266, 44.977)],
        }),
        { status: 200 },
      );
    },
  });

  const buildings = await provider.getBuildings({
    west: -93.267,
    south: 44.976,
    east: -93.264,
    north: 44.979,
  });

  assert.equal(buildings.length, 1);
  assert.equal(buildings[0].id, "service");
  assert.equal(buildings[0].source, "fixture");
  assert.deepEqual(await provider.getMetadata(), {
    provider: "Overture Maps",
    datasetVersion: "2026-07-22.0",
    region: "minneapolis-validation",
  });
});

test("configured HTTP Overture provider is explicit and requires a service URL", () => {
  const originalProvider = process.env.BUILDING_PROVIDER;
  const originalUrl = process.env.BUILDING_QUERY_SERVICE_URL;

  try {
    process.env.BUILDING_PROVIDER = "http-overture";
    delete process.env.BUILDING_QUERY_SERVICE_URL;
    assert.throws(() => createConfiguredBuildingProvider(), /BUILDING_QUERY_SERVICE_URL/);

    process.env.BUILDING_QUERY_SERVICE_URL = "https://buildings.example.test";
    assert.equal(createConfiguredBuildingProvider().mode, "http-overture");
  } finally {
    restoreEnv("BUILDING_PROVIDER", originalProvider);
    restoreEnv("BUILDING_QUERY_SERVICE_URL", originalUrl);
  }
});

test("building query service validates bbox parameters", () => {
  assert.deepEqual(parseBuildingServiceBbox("-93.267,44.976,-93.264,44.979"), {
    west: -93.267,
    south: 44.976,
    east: -93.264,
    north: 44.979,
  });
  assert.throws(() => parseBuildingServiceBbox(null), /bbox query parameter/);
  assert.throws(() => parseBuildingServiceBbox("-93,45,-94,46"), /min values/);
  assert.throws(() => parseBuildingServiceBbox("-181,45,-94,46"), /valid longitude/);
  assert.doesNotThrow(() =>
    assertBboxWithinLimit(
      { west: -93.27, south: 44.97, east: -93.26, north: 44.98 },
      0.25,
    ),
  );
  assert.throws(
    () =>
      assertBboxWithinLimit(
        { west: -93.5, south: 44.8, east: -93.1, north: 45.1 },
        0.25,
      ),
    /configured span limit/,
  );
});

test("building query service supports private bearer authentication", () => {
  assert.equal(isAuthorizedServiceRequest(undefined, ""), true);
  assert.equal(isAuthorizedServiceRequest(undefined, "service-secret"), false);
  assert.equal(
    isAuthorizedServiceRequest("Bearer service-secret", "service-secret"),
    true,
  );
  assert.equal(isAuthorizedServiceRequest("Bearer wrong", "service-secret"), false);
});

test("production environment service refuses to start without authentication", () => {
  assert.throws(
    () => assertEnvironmentServiceAuthentication("production", ""),
    /required in production/,
  );
  assert.doesNotThrow(() =>
    assertEnvironmentServiceAuthentication("production", "service-secret"),
  );
  assert.doesNotThrow(() => assertEnvironmentServiceAuthentication("development", ""));
});

test("multi-region coverage rejects requests outside configured store bounds", () => {
  const manifest = {
    format: "comfortos-local-building-store-v1" as const,
    source: "overture-buildings" as const,
    createdAt: "2026-08-10T00:00:00.000Z",
    region: "minneapolis-validation",
    bbox: [-93.33, 44.93, -93.2, 45.02] as [number, number, number, number],
    tileSizeDegrees: 0.005,
    buildingCount: 1,
    explicitHeightCount: 1,
    floorDerivedHeightCount: 0,
    unknownHeightCount: 0,
  };

  assert.equal(
    manifestIntersectsBounds(manifest, {
      west: -93.27,
      south: 44.97,
      east: -93.26,
      north: 44.98,
    }),
    true,
  );
  assert.equal(
    manifestIntersectsBounds(manifest, {
      west: -87.64,
      south: 41.87,
      east: -87.61,
      north: 41.9,
    }),
    false,
  );
});

async function writeStore(buildings: Array<Building & { bbox: ReturnType<typeof boundsForFootprint> }>) {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), "comfortos-buildings-"));
  const tileIndex: Record<string, number[]> = {};
  const tileSizeDegrees = 0.005;

  buildings.forEach((building, index) => {
    const longitude = Math.floor(building.bbox.west / tileSizeDegrees);
    const latitude = Math.floor(building.bbox.south / tileSizeDegrees);
    const key = `${longitude}:${latitude}`;
    tileIndex[key] ??= [];
    tileIndex[key].push(index);
  });

  await Promise.all([
    fs.writeFile(
      path.join(storeDir, "manifest.json"),
      `${JSON.stringify({
        format: "comfortos-local-building-store-v1",
        source: "overture-buildings",
        createdAt: "2026-08-10T00:00:00.000Z",
        region: "fixture",
        tileSizeDegrees,
        buildingCount: buildings.length,
        explicitHeightCount: buildings.length,
        floorDerivedHeightCount: 0,
        unknownHeightCount: 0,
      })}\n`,
      "utf8",
    ),
    fs.writeFile(
      path.join(storeDir, "buildings.jsonl"),
      `${buildings.map((building) => JSON.stringify(building)).join("\n")}\n`,
      "utf8",
    ),
    fs.writeFile(path.join(storeDir, "tile-index.json"), `${JSON.stringify(tileIndex)}\n`, "utf8"),
  ]);

  return storeDir;
}

function sampleBuilding(id: string, longitude: number, latitude: number) {
  const footprint = polygon([
    [longitude, latitude],
    [longitude + 0.0005, latitude],
    [longitude + 0.0005, latitude + 0.0005],
    [longitude, latitude + 0.0005],
  ]);

  return {
    id,
    footprint,
    bbox: boundsForFootprint(footprint),
    heightMeters: 12,
    minHeightMeters: null,
    floors: null,
    source: "fixture",
    confidence: 1,
    heightSource: "provider" as const,
  };
}

function polygon(coordinates: Array<[number, number]>): Polygon {
  return {
    type: "Polygon",
    coordinates: [[...coordinates, coordinates[0]]],
  };
}

function flakyProvider(): BuildingProvider {
  let calls = 0;

  return {
    async getBuildings() {
      calls += 1;
      if (calls === 1) throw new Error("temporary failure");
      return [sampleBuilding("cached", -93.266, 44.977)];
    },
  };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
