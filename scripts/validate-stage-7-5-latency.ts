import fs from "node:fs/promises";
import { ComfortRouteComparisonService } from "@/lib/comfort-routing/service";
import { createConfiguredBuildingProvider } from "@/lib/environment/buildings/providers/configuredBuildingProvider";
import { ShadeAnalysisService } from "@/lib/environment/shade/service";
import { WindAnalysisService } from "@/lib/environment/wind/windService";
import { CompositeCandidateGenerator } from "@/lib/routing/generators/compositeCandidateGenerator";
import { CorridorWaypointGenerator } from "@/lib/routing/generators/corridorWaypointGenerator";
import { ProviderAlternativeGenerator } from "@/lib/routing/generators/providerAlternativeGenerator";
import { createConfiguredRoutingProvider } from "@/lib/routing/providers/configuredRoutingProvider";
import { RoutingService } from "@/lib/routing/service";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";
import routes from "@/fixtures/routes/minneapolis-stage-5-5-routes.json";

type BenchmarkRow = {
  routeId: string;
  runIndex: number;
  success: boolean;
  fastestMs: number | null;
  comfortMs: number | null;
  generatedCandidates?: number;
  deduplicatedCandidates?: number;
  analyzedCandidates?: number;
  comparableCandidates?: number;
  partialCandidates?: number;
  comfortDiffersFromFastest?: boolean;
  comfortCandidateId?: string;
  fastestCandidateId?: string;
  rawCostRange?: number | null;
  windExposureRange?: number | null;
  shadeRatioRange?: number | null;
  routeOverlapRange?: number | null;
  performanceMs?: Record<string, number | undefined>;
  managedRoutingRequests?: number;
  error?: string;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const routeLimit = options.limit ? Number(options.limit) : routes.length;
  const repeat = options.repeat ? Number(options.repeat) : 1;
  const maxCandidateAttempts = Number(options.maxCandidateAttempts ?? 4);
  const maxEnvironmentAnalyzedCandidates = Number(
    options.maxEnvironmentAnalyzedCandidates ?? 5,
  );
  const maxConcurrentCandidateRequests = Number(
    options.maxConcurrentCandidateRequests ?? 1,
  );
  const earlyStopDiverseCandidateCount =
    options.earlyStopDiverseCandidateCount === undefined
      ? Number.POSITIVE_INFINITY
      : Number(options.earlyStopDiverseCandidateCount);
  const adaptiveAttempts = options.adaptiveAttempts === "true";
  const departureTime = options.departureTime ?? new Date().toISOString();

  if (options.localStore) {
    process.env.BUILDING_PROVIDER = "local-overture";
    process.env.BUILDING_LOCAL_OVERTURE_STORE_DIR = options.localStore;
  }

  const { provider: routingProvider, metadata: routingProviderMetadata } =
    createConfiguredRoutingProvider();
  const routingService = new RoutingService(routingProvider);
  const weatherService = new WeatherService(
    new NwsWeatherProvider({
      baseUrl: process.env.WEATHER_BASE_URL,
      userAgent: process.env.WEATHER_USER_AGENT,
    }),
  );
  const { provider: buildingProvider, mode: buildingProviderMode } =
    createConfiguredBuildingProvider();
  const comparisonService = new ComfortRouteComparisonService(
    routingService,
    new CompositeCandidateGenerator([
      new ProviderAlternativeGenerator(routingService),
      new CorridorWaypointGenerator(routingService),
    ]),
    weatherService,
    buildingProvider,
    new ShadeAnalysisService(buildingProvider),
    new WindAnalysisService(buildingProvider, weatherService),
    undefined,
    buildingProviderMode,
  );

  const rows: BenchmarkRow[] = [];
  for (let runIndex = 0; runIndex < repeat; runIndex += 1) {
    for (const route of routes.slice(0, routeLimit)) {
      rows.push(
        await benchmarkRoute({
          route,
          runIndex,
          departureTime,
          routingService,
          comparisonService,
          maxCandidateAttempts,
          maxEnvironmentAnalyzedCandidates,
          maxConcurrentCandidateRequests,
          earlyStopDiverseCandidateCount,
          adaptiveAttempts,
        }),
      );
    }
  }

  const report = {
    createdAt: new Date().toISOString(),
    routeCount: routeLimit,
    repeat,
    providerMode: buildingProviderMode,
    routingProvider: routingProviderMetadata,
    generationPolicy: {
      maxCandidateAttempts,
      maxEnvironmentAnalyzedCandidates,
      maxConcurrentCandidateRequests,
      earlyStopDiverseCandidateCount: Number.isFinite(earlyStopDiverseCandidateCount)
        ? earlyStopDiverseCandidateCount
        : "disabled",
      adaptiveAttempts,
    },
    summary: summarize(rows),
    rows,
  };

  if (options.output) {
    await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(report, null, 2));
}

async function benchmarkRoute({
  route,
  runIndex,
  departureTime,
  routingService,
  comparisonService,
  maxCandidateAttempts,
  maxEnvironmentAnalyzedCandidates,
  maxConcurrentCandidateRequests,
  earlyStopDiverseCandidateCount,
  adaptiveAttempts,
}: {
  route: (typeof routes)[number];
  runIndex: number;
  departureTime: string;
  routingService: RoutingService;
  comparisonService: ComfortRouteComparisonService;
  maxCandidateAttempts: number;
  maxEnvironmentAnalyzedCandidates: number;
  maxConcurrentCandidateRequests: number;
  earlyStopDiverseCandidateCount: number;
  adaptiveAttempts: boolean;
}): Promise<BenchmarkRow> {
  try {
    const fastestStartedAt = performance.now();
    await routingService.getFastestWalkingRoute({
      origin: route.origin,
      destination: route.destination,
      departureTime,
    });
    const fastestMs = Math.round(performance.now() - fastestStartedAt);

    const comfortStartedAt = performance.now();
    const comparison = await comparisonService.compareWalkingRoutes({
      origin: route.origin,
      destination: route.destination,
      departureTime,
      generationMode: "enhanced",
      includeEnvironmentalDebug: false,
      generationPolicy: {
        maxCandidateAttempts,
        maxEnvironmentAnalyzedCandidates,
        maxConcurrentCandidateRequests,
        earlyStopDiverseCandidateCount,
        adaptiveAttempts,
      },
    });
    const comfortMs = Math.round(performance.now() - comfortStartedAt);
    const comparableCandidates = comparison.debug.candidates.filter(
      (candidate) => candidate.comparable,
    ).length;

    return {
      routeId: route.id,
      runIndex,
      success: true,
      fastestMs,
      comfortMs,
      generatedCandidates: comparison.debug.generation?.generatedCandidates,
      deduplicatedCandidates: comparison.debug.generation?.deduplicatedCandidates,
      analyzedCandidates: comparison.debug.generation?.environmentAnalyzedCandidates,
      comparableCandidates,
      partialCandidates: comparison.debug.candidates.length - comparableCandidates,
      comfortDiffersFromFastest: comparison.fastest.id !== comparison.comfort.id,
      comfortCandidateId: comparison.comfort.id,
      fastestCandidateId: comparison.fastest.id,
      rawCostRange: comparison.debug.generation?.diversity?.rawEnvironmentalCostRange,
      windExposureRange: comparison.debug.generation?.diversity?.windExposureRange,
      shadeRatioRange: comparison.debug.generation?.diversity?.shadeRatioRange,
      routeOverlapRange: comparison.debug.generation?.diversity?.routeOverlapRange,
      performanceMs: comparison.debug.performanceMs,
      managedRoutingRequests: 1 + (comparison.debug.routingUsage?.totalRequests ?? 0),
    };
  } catch (error) {
    return {
      routeId: route.id,
      runIndex,
      success: false,
      fastestMs: null,
      comfortMs: null,
      error: error instanceof Error ? error.message : "Validation failed.",
    };
  }
}

function summarize(rows: BenchmarkRow[]) {
  const successes = rows.filter((row) => row.success);
  const stages = [
    "fastestRoute",
    "providerAlternatives",
    "corridorCandidates",
    "candidateGeneration",
    "candidateNormalization",
    "candidateDedupe",
    "detourFiltering",
    "diversityFiltering",
    "weather",
    "buildingFetch",
    "buildingMetadata",
    "buildingPreparation",
    "shadeAnalysis",
    "windAnalysis",
    "comfortAnalysis",
    "candidateAnalysis",
    "reranking",
    "serialization",
    "total",
  ];

  return {
    searches: rows.length,
    successCount: successes.length,
    failureCount: rows.length - successes.length,
    fastest: stats(successes.flatMap((row) => row.fastestMs ?? [])),
    comfort: stats(successes.flatMap((row) => row.comfortMs ?? [])),
    stages: Object.fromEntries(
      stages.map((stage) => [
        stage,
        stats(
          successes.flatMap((row) => {
            const value = row.performanceMs?.[stage];
            return Number.isFinite(value) ? [value as number] : [];
          }),
        ),
      ]),
    ),
    generatedCandidates: stats(
      successes.flatMap((row) => row.generatedCandidates ?? []),
    ),
    deduplicatedCandidates: stats(
      successes.flatMap((row) => row.deduplicatedCandidates ?? []),
    ),
    analyzedCandidates: stats(successes.flatMap((row) => row.analyzedCandidates ?? [])),
    comparableCandidates: stats(
      successes.flatMap((row) => row.comparableCandidates ?? []),
    ),
    rawCostRange: stats(successes.flatMap((row) => row.rawCostRange ?? [])),
    windExposureRange: stats(successes.flatMap((row) => row.windExposureRange ?? [])),
    shadeRatioRange: stats(successes.flatMap((row) => row.shadeRatioRange ?? [])),
    routeOverlapRange: stats(successes.flatMap((row) => row.routeOverlapRange ?? [])),
    managedRoutingRequests: stats(
      successes.flatMap((row) => row.managedRoutingRequests ?? []),
    ),
    limitedDataCount: successes.filter((row) => (row.comparableCandidates ?? 0) === 0)
      .length,
    comfortDiffersFromFastestCount: successes.filter(
      (row) => row.comfortDiffersFromFastest,
    ).length,
    comfortSameAsFastestCount: successes.filter(
      (row) => row.comfortDiffersFromFastest === false,
    ).length,
  };
}

function stats(values: number[]) {
  if (values.length === 0) {
    return { mean: null, median: null, p75: null, p95: null, max: null };
  }

  return {
    mean: average(values),
    median: percentile(values, 0.5),
    p75: percentile(values, 0.75),
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
