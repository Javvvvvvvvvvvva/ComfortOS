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

type ValidationRow = {
  routeId: string;
  success: boolean;
  fastestMs: number | null;
  comfortMs: number | null;
  generatedCandidates?: number;
  analyzedCandidates?: number;
  comparableCandidates?: number;
  partialCandidates?: number;
  comfortDiffersFromFastest?: boolean;
  buildingFetchMs?: number;
  routingCandidatesMs?: number;
  shadeMs?: number;
  windMs?: number;
  analysisMs?: number;
  error?: string;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const maxCandidateAttempts = Number(options.maxCandidateAttempts ?? 6);
  const maxEnvironmentAnalyzedCandidates = Number(
    options.maxEnvironmentAnalyzedCandidates ?? 5,
  );
  const routeLimit = options.limit ? Number(options.limit) : routes.length;

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
  const departureTime = options.departureTime ?? new Date().toISOString();
  const rows: ValidationRow[] = [];

  for (const route of routes.slice(0, routeLimit)) {
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
        },
      });
      const comfortMs = Math.round(performance.now() - comfortStartedAt);
      const comparableCandidates = comparison.debug.candidates.filter(
        (candidate) => candidate.comparable,
      ).length;

      rows.push({
        routeId: route.id,
        success: true,
        fastestMs,
        comfortMs,
        generatedCandidates: comparison.debug.generation?.generatedCandidates,
        analyzedCandidates:
          comparison.debug.generation?.environmentAnalyzedCandidates,
        comparableCandidates,
        partialCandidates: comparison.debug.candidates.length - comparableCandidates,
        comfortDiffersFromFastest: comparison.fastest.id !== comparison.comfort.id,
        buildingFetchMs: comparison.debug.performanceMs?.buildingFetch,
        routingCandidatesMs: comparison.debug.performanceMs?.routingCandidates,
        shadeMs: comparison.debug.performanceMs?.shadeAnalysis,
        windMs: comparison.debug.performanceMs?.windAnalysis,
        analysisMs: comparison.debug.performanceMs?.candidateAnalysis,
      });
    } catch (error) {
      rows.push({
        routeId: route.id,
        success: false,
        fastestMs: null,
        comfortMs: null,
        error: error instanceof Error ? error.message : "Validation failed.",
      });
    }
  }

  const report = {
    createdAt: new Date().toISOString(),
    routeCount: routeLimit,
    providerMode: buildingProviderMode,
    routingProvider: routingProviderMetadata,
    generationPolicy: {
      maxCandidateAttempts,
      maxEnvironmentAnalyzedCandidates,
    },
    summary: summarize(rows),
    rows,
  };

  if (options.output) {
    await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(report, null, 2));
}

function summarize(rows: ValidationRow[]) {
  const successes = rows.filter((row) => row.success);
  return {
    searches: rows.length,
    successCount: successes.length,
    failureCount: rows.length - successes.length,
    averageFastestMs: average(successes.flatMap((row) => row.fastestMs ?? [])),
    p95FastestMs: percentile(successes.flatMap((row) => row.fastestMs ?? []), 0.95),
    averageComfortMs: average(successes.flatMap((row) => row.comfortMs ?? [])),
    p95ComfortMs: percentile(successes.flatMap((row) => row.comfortMs ?? []), 0.95),
    averageGeneratedCandidates: average(
      successes.flatMap((row) => row.generatedCandidates ?? []),
    ),
    averageAnalyzedCandidates: average(
      successes.flatMap((row) => row.analyzedCandidates ?? []),
    ),
    averageComparableCandidates: average(
      successes.flatMap((row) => row.comparableCandidates ?? []),
    ),
    limitedDataCount: successes.filter((row) => (row.comparableCandidates ?? 0) === 0)
      .length,
    comfortDiffersFromFastestCount: successes.filter(
      (row) => row.comfortDiffersFromFastest,
    ).length,
    comfortSameAsFastestCount: successes.filter(
      (row) => row.comfortDiffersFromFastest === false,
    ).length,
    averageBuildingFetchMs: average(successes.flatMap((row) => row.buildingFetchMs ?? [])),
    averageRoutingCandidatesMs: average(
      successes.flatMap((row) => row.routingCandidatesMs ?? []),
    ),
    averageShadeMs: average(successes.flatMap((row) => row.shadeMs ?? [])),
    averageWindMs: average(successes.flatMap((row) => row.windMs ?? [])),
    averageAnalysisMs: average(successes.flatMap((row) => row.analysisMs ?? [])),
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
    options[key.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value;
  }
  return options;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
