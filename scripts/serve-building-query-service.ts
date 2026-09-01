import http from "node:http";
import { LocalOvertureBuildingProvider } from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";
import { MultiRegionOvertureBuildingProvider } from "@/lib/environment/buildings/providers/multiRegionOvertureBuildingProvider";
import type { BoundingBox } from "@/lib/environment/buildings/types";

const storeDirs =
  process.env.BUILDING_LOCAL_OVERTURE_STORE_DIRS ??
  process.env.BUILDING_LOCAL_OVERTURE_STORE_DIR ??
  process.argv[2];
const port = Number(process.env.BUILDING_QUERY_SERVICE_PORT ?? process.env.PORT ?? 8787);

if (process.argv[1]?.endsWith("serve-building-query-service.ts")) {
  if (!storeDirs) {
    throw new Error(
      "Pass a store directory, set BUILDING_LOCAL_OVERTURE_STORE_DIR, or set BUILDING_LOCAL_OVERTURE_STORE_DIRS.",
    );
  }

  const configuredStoreDirs = storeDirs.split(",").map((value) => value.trim()).filter(Boolean);
  const provider =
    configuredStoreDirs.length > 1
      ? new MultiRegionOvertureBuildingProvider(configuredStoreDirs)
      : new LocalOvertureBuildingProvider({ storeDir: configuredStoreDirs[0] });

  const server = http.createServer(async (request, response) => {
    const startedAt = performance.now();
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, {
          status: "ready",
          metadata: await provider.getMetadata(),
        });
      }

      if (request.method === "GET" && url.pathname === "/metadata") {
        return sendJson(response, 200, { metadata: await provider.getMetadata() });
      }

      if (request.method !== "GET" || url.pathname !== "/buildings") {
        return sendJson(response, 404, { error: "Not found." });
      }

      const bounds = parseBuildingServiceBbox(url.searchParams.get("bbox"));
      const buildings = await provider.getBuildings(bounds);
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
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-ComfortOS-Dataset-Version": metadata.datasetVersion ?? "unknown",
        },
      );
    } catch (error) {
      return sendJson(
        response,
        400,
        { error: error instanceof Error ? error.message : "Building query failed." },
      );
    }
  });

  server.listen(port, () => {
    console.log(`ComfortOS building query service listening on http://127.0.0.1:${port}`);
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
