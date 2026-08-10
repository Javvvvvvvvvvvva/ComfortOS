import fs from "node:fs/promises";
import { CachedBuildingProvider } from "@/lib/environment/buildings/cache";
import type {
  BoundingBox,
  Building,
  BuildingProvider,
} from "@/lib/environment/buildings/types";
import { LocalOvertureBuildingProvider } from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";
import { OverpassBuildingProvider } from "@/lib/environment/buildings/providers/overpassBuildingProvider";
import routes from "@/fixtures/routes/minneapolis-stage-5-5-routes.json";

type RouteFixture = (typeof routes)[number];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const providers: Array<{ id: string; provider: BuildingProvider }> = [];

  if (options.localStore) {
    providers.push({
      id: "local-overture",
      provider: new CachedBuildingProvider(
        new LocalOvertureBuildingProvider({ storeDir: options.localStore }),
      ),
    });
  }

  if (options.includeOverpass === "true") {
    providers.push({
      id: "overpass",
      provider: new CachedBuildingProvider(new OverpassBuildingProvider()),
    });
  }

  if (providers.length === 0) {
    throw new Error("Pass --local-store <dir>, --include-overpass true, or both.");
  }

  const startedAt = performance.now();
  const rows = [];
  for (const route of routes) {
    const bounds = boundsForRoute(route, Number(options.paddingDegrees ?? 0.003));
    for (const { id, provider } of providers) {
      rows.push(await benchmarkProvider(id, provider, route, bounds));
    }
  }
  const summary = summarize(rows);
  const report = {
    createdAt: new Date().toISOString(),
    routeCount: routes.length,
    totalMs: Math.round(performance.now() - startedAt),
    summary,
    rows,
  };

  if (options.output) {
    await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(report, null, 2));
}

async function benchmarkProvider(
  providerId: string,
  provider: BuildingProvider,
  route: RouteFixture,
  bounds: BoundingBox,
) {
  const startedAt = performance.now();

  try {
    const buildings = await provider.getBuildings(bounds);
    return {
      providerId,
      routeId: route.id,
      category: route.category,
      success: true,
      latencyMs: Math.round(performance.now() - startedAt),
      ...coverage(buildings),
    };
  } catch (error) {
    return {
      providerId,
      routeId: route.id,
      category: route.category,
      success: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "Building provider failed.",
      buildingCount: 0,
      explicitHeightCount: 0,
      floorDerivedHeightCount: 0,
      unknownHeightCount: 0,
      usableHeightRatio: 0,
    };
  }
}

function coverage(buildings: Building[]) {
  const explicitHeightCount = buildings.filter(
    (building) => building.heightSource === "provider",
  ).length;
  const floorDerivedHeightCount = buildings.filter(
    (building) => building.heightSource === "floors-derived",
  ).length;
  const unknownHeightCount = buildings.filter(
    (building) => building.heightSource === "unknown",
  ).length;
  const usableHeightCount = explicitHeightCount + floorDerivedHeightCount;

  return {
    buildingCount: buildings.length,
    explicitHeightCount,
    floorDerivedHeightCount,
    unknownHeightCount,
    usableHeightRatio:
      buildings.length > 0 ? usableHeightCount / buildings.length : 0,
  };
}

function summarize(rows: Awaited<ReturnType<typeof benchmarkProvider>>[]) {
  const byProvider: Record<string, typeof rows> = {};
  for (const row of rows) {
    byProvider[row.providerId] ??= [];
    byProvider[row.providerId].push(row);
  }

  return Object.fromEntries(
    Object.entries(byProvider).map(([providerId, providerRows]) => {
      const successes = providerRows.filter((row) => row.success);
      const latencies = successes.map((row) => row.latencyMs);

      return [
        providerId,
        {
          requestCount: providerRows.length,
          successCount: successes.length,
          failureCount: providerRows.length - successes.length,
          failureRate:
            providerRows.length > 0
              ? (providerRows.length - successes.length) / providerRows.length
              : 0,
          averageLatencyMs: average(latencies),
          p95LatencyMs: percentile(latencies, 0.95),
          averageBuildingCount: average(successes.map((row) => row.buildingCount)),
          averageUsableHeightRatio: average(successes.map((row) => row.usableHeightRatio)),
        },
      ];
    }),
  );
}

function boundsForRoute(route: RouteFixture, padding: number): BoundingBox {
  return {
    west: Math.min(route.origin.longitude, route.destination.longitude) - padding,
    south: Math.min(route.origin.latitude, route.destination.latitude) - padding,
    east: Math.max(route.origin.longitude, route.destination.longitude) + padding,
    north: Math.max(route.origin.latitude, route.destination.latitude) + padding,
  };
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function parseArgs(args: string[]) {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    }
    options[toCamelCase(key.slice(2))] = value;
  }
  return options;
}

function toCamelCase(value: string) {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
