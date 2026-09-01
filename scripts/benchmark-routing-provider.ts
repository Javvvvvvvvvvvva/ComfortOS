import fs from "node:fs/promises";
import { createConfiguredRoutingProvider } from "@/lib/routing/providers/configuredRoutingProvider";
import { calculateCandidateDiversity } from "@/lib/routing/candidates";
import { CompositeCandidateGenerator } from "@/lib/routing/generators/compositeCandidateGenerator";
import { CorridorWaypointGenerator } from "@/lib/routing/generators/corridorWaypointGenerator";
import { ProviderAlternativeGenerator } from "@/lib/routing/generators/providerAlternativeGenerator";
import { RoutingService } from "@/lib/routing/service";
import type { Coordinate, LineStringGeometry } from "@/lib/geo/types";
import {
  createRoutingUsageMetrics,
  type RoutingUsageMetrics,
} from "@/lib/routing/types";

type ValidationRoute = {
  id: string;
  label: string;
  origin: Coordinate;
  destination: Coordinate;
};

type CityConfig = {
  id: "minneapolis" | "seattle" | "phoenix";
  routesFile: string;
};

type BenchmarkRow = {
  city: string;
  routeId: string;
  concurrency: number;
  success: boolean;
  fastestMs: number | null;
  candidatesMs: number | null;
  providerAlternativesMs: number | null;
  corridorCandidatesMs: number | null;
  candidateCount: number;
  averageUniqueMeters: number | null;
  maxLateralSeparationMeters: number | null;
  minimumOverlapWithFastest: number | null;
  usage: RoutingUsageMetrics;
  routeGeometryHash?: string;
  error?: string;
};

const CITIES: CityConfig[] = [
  {
    id: "minneapolis",
    routesFile: "fixtures/routes/minneapolis-stage-5-5-routes.json",
  },
  {
    id: "seattle",
    routesFile: "config/validation-routes/seattle-stage8.json",
  },
  {
    id: "phoenix",
    routesFile: "config/validation-routes/phoenix-stage9.json",
  },
];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const limit = options.limit ? Number(options.limit) : 6;
  const departureTime = options.departureTime ?? new Date().toISOString();
  const concurrencyValues = (options.concurrency ?? "1,2,4")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  const { provider, metadata, mode } = createConfiguredRoutingProvider();
  const routingService = new RoutingService(provider);
  const candidateGenerator = new CompositeCandidateGenerator([
    new ProviderAlternativeGenerator(routingService),
    new CorridorWaypointGenerator(routingService),
  ]);
  const health = await routingService.checkProviderHealth();
  const routeDelayMs = options.routeDelayMs ? Number(options.routeDelayMs) : 0;
  const candidateAttempts = options.candidateAttempts
    ? Number(options.candidateAttempts)
    : 4;
  const rows: BenchmarkRow[] = [];

  for (const city of CITIES) {
    const routes = await readRoutes(city.routesFile, limit);
    for (const concurrency of concurrencyValues) {
      for (const route of routes) {
        rows.push(
          await benchmarkRoute({
            city: city.id,
            route,
            concurrency,
            departureTime,
            routingService,
            candidateGenerator,
            candidateAttempts,
          }),
        );
        if (routeDelayMs > 0) await delay(routeDelayMs);
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    providerMode: mode,
    provider: metadata,
    health,
    routeLimitPerCity: limit,
    concurrencyValues,
    routeDelayMs,
    candidateAttempts,
    summary: summarize(rows),
    rows,
  };

  if (options.output) {
    await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(report, null, 2));
}

async function readRoutes(filePath: string, limit: number) {
  const routes = JSON.parse(await fs.readFile(filePath, "utf8")) as ValidationRoute[];
  return routes.slice(0, limit);
}

async function benchmarkRoute({
  city,
  route,
  concurrency,
  departureTime,
  routingService,
  candidateGenerator,
  candidateAttempts,
}: {
  city: string;
  route: ValidationRoute;
  concurrency: number;
  departureTime: string;
  routingService: RoutingService;
  candidateGenerator: CompositeCandidateGenerator;
  candidateAttempts: number;
}): Promise<BenchmarkRow> {
  const usage = createRoutingUsageMetrics();
  const generationTiming: Record<string, number> = {};
  try {
    const fastestStartedAt = performance.now();
    const fastestRoute = await routingService.getFastestWalkingRoute(
      {
        origin: route.origin,
        destination: route.destination,
        departureTime,
      },
      { usageMetrics: usage, usageCategory: "fastest" },
    );
    const fastestMs = Math.round(performance.now() - fastestStartedAt);

    const candidatesStartedAt = performance.now();
    const candidateSet = await candidateGenerator.generateCandidates(
      {
        origin: route.origin,
        destination: route.destination,
        departureTime,
      },
      {
        fastestRoute,
        policy: {
          maxCandidateAttempts: candidateAttempts,
          maxConcurrentCandidateRequests: concurrency,
          maxEnvironmentAnalyzedCandidates: 5,
        },
        usageMetrics: usage,
        diagnostics: {
          recordStage(stage, durationMs) {
            generationTiming[stage] = Math.round(durationMs);
          },
        },
      },
    );
    const candidatesMs = Math.round(performance.now() - candidatesStartedAt);
    const diversity = candidateSet.candidates
      .map((candidate) => calculateCandidateDiversity(candidate, fastestRoute))
      .filter((candidate) => candidate.uniqueMeters > 1);

    return {
      city,
      routeId: route.id,
      concurrency,
      success: true,
      fastestMs,
      candidatesMs,
      providerAlternativesMs:
        generationTiming["candidateGeneration.provider-alternative"] ?? null,
      corridorCandidatesMs:
        generationTiming["candidateGeneration.corridor-waypoint"] ?? null,
      candidateCount: candidateSet.candidates.length,
      averageUniqueMeters: nullableAverage(
        diversity.map((candidate) => candidate.uniqueMeters),
      ),
      maxLateralSeparationMeters: maximum(
        diversity.map((candidate) => candidate.maxLateralSeparationMeters),
      ),
      minimumOverlapWithFastest: minimum(
        diversity.map((candidate) => candidate.overlapWithFastest),
      ),
      usage,
      routeGeometryHash: routeGeometryHash(fastestRoute.geometry),
    };
  } catch (error) {
    return {
      city,
      routeId: route.id,
      concurrency,
      success: false,
      fastestMs: null,
      candidatesMs: null,
      providerAlternativesMs:
        generationTiming["candidateGeneration.provider-alternative"] ?? null,
      corridorCandidatesMs:
        generationTiming["candidateGeneration.corridor-waypoint"] ?? null,
      candidateCount: 0,
      averageUniqueMeters: null,
      maxLateralSeparationMeters: null,
      minimumOverlapWithFastest: null,
      usage,
      error: error instanceof Error ? error.message : "Routing benchmark failed.",
    };
  }
}

function routeGeometryHash(geometry: LineStringGeometry) {
  const key = geometry.coordinates
    .map(([longitude, latitude]) => `${longitude.toFixed(5)},${latitude.toFixed(5)}`)
    .join("|");
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function summarize(rows: BenchmarkRow[]) {
  const successes = rows.filter((row) => row.success);
  const byConcurrency = Object.fromEntries(
    [...new Set(rows.map((row) => row.concurrency))].map((concurrency) => {
      const matching = rows.filter((row) => row.concurrency === concurrency);
      const successful = matching.filter((row) => row.success);
      return [
        concurrency,
        {
          searches: matching.length,
          successCount: successful.length,
          failureCount: matching.length - successful.length,
          fastestMs: stats(successful.flatMap((row) => row.fastestMs ?? [])),
          candidatesMs: stats(successful.flatMap((row) => row.candidatesMs ?? [])),
          providerAlternativesMs: stats(
            successful.flatMap((row) => row.providerAlternativesMs ?? []),
          ),
          corridorCandidatesMs: stats(
            successful.flatMap((row) => row.corridorCandidatesMs ?? []),
          ),
          candidateCount: stats(successful.map((row) => row.candidateCount)),
          averageUniqueMeters: stats(
            successful.flatMap((row) => row.averageUniqueMeters ?? []),
          ),
          maxLateralSeparationMeters: stats(
            successful.flatMap((row) => row.maxLateralSeparationMeters ?? []),
          ),
          minimumOverlapWithFastest: stats(
            successful.flatMap((row) => row.minimumOverlapWithFastest ?? []),
          ),
          routingRequests: stats(successful.map((row) => row.usage.totalRequests)),
        },
      ];
    }),
  );

  return {
    searches: rows.length,
    successCount: successes.length,
    failureCount: rows.length - successes.length,
    successRate: rows.length > 0 ? successes.length / rows.length : 0,
    byCity: Object.fromEntries(
      [...new Set(rows.map((row) => row.city))].map((city) => {
        const matching = rows.filter((row) => row.city === city);
        const successful = matching.filter((row) => row.success);
        return [
          city,
          {
            searches: matching.length,
            successCount: successful.length,
            failureCount: matching.length - successful.length,
            successRate: matching.length > 0 ? successful.length / matching.length : 0,
            fastestMs: stats(successful.flatMap((row) => row.fastestMs ?? [])),
            fullCandidateGenerationMs: stats(
              successful.flatMap((row) => row.candidatesMs ?? []),
            ),
            routingRequests: stats(successful.map((row) => row.usage.totalRequests)),
          },
        ];
      }),
    ),
    byConcurrency,
  };
}

function nullableAverage(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maximum(values: number[]) {
  return values.length > 0 ? Math.max(...values) : null;
}

function minimum(values: number[]) {
  return values.length > 0 ? Math.min(...values) : null;
}

function stats(values: number[]) {
  if (values.length === 0) {
    return { mean: null, median: null, p95: null, max: null };
  }
  return {
    mean: average(values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  };
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function delay(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function parseArgs(args: string[]) {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    }
    options[key.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return options;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
