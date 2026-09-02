import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { LocalOvertureBuildingProvider } from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";
import { MultiRegionOvertureBuildingProvider } from "@/lib/environment/buildings/providers/multiRegionOvertureBuildingProvider";
import type { BoundingBox } from "@/lib/environment/buildings/types";
import { StaticCoveredFeatureProvider } from "@/lib/environment/coveredFeatures/providers/staticCoveredFeatureProvider";

const storeDirs =
  process.env.BUILDING_LOCAL_OVERTURE_STORE_DIRS ??
  process.env.BUILDING_LOCAL_OVERTURE_STORE_DIR ??
  process.argv[2];
const port = Number(process.env.BUILDING_QUERY_SERVICE_PORT ?? process.env.PORT ?? 8787);
const serviceToken =
  process.env.ENVIRONMENT_QUERY_SERVICE_TOKEN ??
  process.env.BUILDING_QUERY_SERVICE_TOKEN ??
  "";
const maxBboxSpanDegrees = parsePositiveNumber(
  process.env.ENVIRONMENT_QUERY_SERVICE_MAX_BBOX_SPAN_DEGREES,
  0.25,
);
const maxBuildings = parsePositiveInteger(
  process.env.BUILDING_QUERY_SERVICE_MAX_BUILDINGS,
  25_000,
);
const maxCoveredFeatures = parsePositiveInteger(
  process.env.COVERED_FEATURE_QUERY_SERVICE_MAX_FEATURES,
  10_000,
);
const queryTimeoutMs = parsePositiveInteger(
  process.env.ENVIRONMENT_QUERY_SERVICE_TIMEOUT_MS,
  8_000,
);

if (
  process.argv[1]?.endsWith("serve-building-query-service.ts") ||
  process.argv[1]?.endsWith("service.mjs")
) {
  if (!storeDirs) {
    throw new Error(
      "Pass a store directory, set BUILDING_LOCAL_OVERTURE_STORE_DIR, or set BUILDING_LOCAL_OVERTURE_STORE_DIRS.",
    );
  }
  assertEnvironmentServiceAuthentication(process.env.NODE_ENV, serviceToken);

  const configuredStoreDirs = storeDirs.split(",").map((value) => value.trim()).filter(Boolean);
  const provider =
    configuredStoreDirs.length > 1
      ? new MultiRegionOvertureBuildingProvider(configuredStoreDirs)
      : new LocalOvertureBuildingProvider({ storeDir: configuredStoreDirs[0] });
  const coveredFeatureProvider = process.env.COVERED_FEATURE_STATIC_GEOJSON
    ? new StaticCoveredFeatureProvider({
        filePath: process.env.COVERED_FEATURE_STATIC_GEOJSON,
        region: process.env.COVERED_FEATURE_REGION,
      })
    : null;

  const server = http.createServer(async (request, response) => {
    const startedAt = performance.now();
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, {
          status: "ready",
          capabilities: {
            buildings: true,
            coveredFeatures: coveredFeatureProvider !== null,
          },
          datasetVersion: (await provider.getMetadata())?.datasetVersion ?? "unknown",
        });
      }

      if (!isAuthorizedServiceRequest(request.headers.authorization, serviceToken)) {
        return sendJson(response, 401, { error: "Unauthorized." }, privateNoStoreHeaders());
      }

      if (request.method === "GET" && url.pathname === "/metadata") {
        const coveredMetadata = coveredFeatureProvider
          ? (await coveredFeatureProvider.getCoveredFeatures(worldBounds())).metadata
          : null;
        return sendJson(
          response,
          200,
          {
            metadata: await provider.getMetadata(),
            coveredFeatures: coveredMetadata
              ? {
                  ...coveredMetadata,
                  source: "OSM-derived covered-feature store",
                  mode: "covered-query-service",
                }
              : null,
          },
          privateCacheHeaders(),
        );
      }

      if (request.method === "GET" && url.pathname === "/covered-features") {
        if (!coveredFeatureProvider) {
          return sendJson(
            response,
            503,
            { error: "Covered-feature dataset unavailable." },
            privateNoStoreHeaders(),
          );
        }
        const bounds = parseBuildingServiceBbox(url.searchParams.get("bbox"));
        assertBboxWithinLimit(bounds, maxBboxSpanDegrees);
        const result = await withTimeout(
          coveredFeatureProvider.getCoveredFeatures(bounds),
          queryTimeoutMs,
        );
        if (result.features.length > maxCoveredFeatures) {
          return sendJson(
            response,
            413,
            { error: "Covered-feature result exceeds the configured limit." },
            privateNoStoreHeaders(),
          );
        }
        return sendJson(
          response,
          200,
          {
            features: result.features,
            metadata: {
              ...result.metadata,
              source: "OSM-derived covered-feature store",
              mode: "covered-query-service",
              queryLatencyMs: Math.round(performance.now() - startedAt),
            },
          },
          privateCacheHeaders(),
        );
      }

      if (request.method !== "GET" || url.pathname !== "/buildings") {
        return sendJson(response, 404, { error: "Not found." });
      }

      const bounds = parseBuildingServiceBbox(url.searchParams.get("bbox"));
      assertBboxWithinLimit(bounds, maxBboxSpanDegrees);
      const buildings = await withTimeout(provider.getBuildings(bounds), queryTimeoutMs);
      if (buildings.length > maxBuildings) {
        return sendJson(
          response,
          413,
          { error: "Building result exceeds the configured limit." },
          privateNoStoreHeaders(),
        );
      }
      const baseMetadata =
        "getMetadataForBounds" in provider
          ? await provider.getMetadataForBounds(bounds)
          : await provider.getMetadata();
      const metadata = {
        ...baseMetadata,
        queryLatencyMs: Math.round(performance.now() - startedAt),
      };

      return sendJson(
        response,
        200,
        { buildings, metadata },
        {
          ...privateCacheHeaders(),
          "X-ComfortOS-Dataset-Version": metadata.datasetVersion ?? "unknown",
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Environment query failed.";
      const status =
        /bbox|required|outside valid|less than|configured span/i.test(message)
          ? 400
          : /timed out/i.test(message)
            ? 504
            : 500;
      return sendJson(
        response,
        status,
        { error: status === 500 ? "Environment query failed." : message },
        privateNoStoreHeaders(),
      );
    }
  });

  server.listen(port, () => {
    console.log(`ComfortOS environment query service listening on port ${port}`);
  });
}

export function parseBuildingServiceBbox(value: string | null): BoundingBox {
  if (!value) throw new Error("bbox query parameter is required.");
  const [west, south, east, north] = value.split(",").map(Number);
  if (![west, south, east, north].every(Number.isFinite)) {
    throw new Error("bbox must be west,south,east,north.");
  }
  if (west >= east || south >= north) {
    throw new Error("bbox min values must be less than max values.");
  }
  if (west < -180 || east > 180 || south < -90 || north > 90) {
    throw new Error("bbox is outside valid longitude/latitude bounds.");
  }
  return { west, south, east, north };
}

export function assertBboxWithinLimit(bounds: BoundingBox, maxSpanDegrees = 0.25) {
  if (
    bounds.east - bounds.west > maxSpanDegrees ||
    bounds.north - bounds.south > maxSpanDegrees
  ) {
    throw new Error("bbox exceeds the configured span limit.");
  }
}

export function isAuthorizedServiceRequest(
  authorizationHeader: string | undefined,
  expectedToken: string,
) {
  if (!expectedToken) return true;
  const supplied = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length)
    : "";
  const expectedBuffer = Buffer.from(expectedToken);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export function assertEnvironmentServiceAuthentication(
  nodeEnv: string | undefined,
  token: string,
) {
  if (nodeEnv === "production" && !token.trim()) {
    throw new Error(
      "ENVIRONMENT_QUERY_SERVICE_TOKEN is required in production.",
    );
  }
}

function sendJson(
  response: http.ServerResponse,
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    ...headers,
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function privateCacheHeaders() {
  return {
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  };
}

function privateNoStoreHeaders() {
  return {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function worldBounds(): BoundingBox {
  return { west: -180, south: -90, east: 180, north: 90 };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Environment query timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
