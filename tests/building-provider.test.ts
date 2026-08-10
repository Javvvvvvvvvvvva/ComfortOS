import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Feature, Polygon } from "geojson";
import { CachedBuildingProvider } from "@/lib/environment/buildings/cache";
import type { Building, BuildingProvider } from "@/lib/environment/buildings/types";
import {
  boundsForFootprint,
  LocalOvertureBuildingProvider,
} from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";
import { normalizeOvertureFeature } from "@/scripts/ingest-overture-buildings";

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
