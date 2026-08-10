import fs from "node:fs/promises";
import { ComfortRouteComparisonService } from "@/lib/comfort-routing/service";
import { createConfiguredBuildingProvider } from "@/lib/environment/buildings/providers/configuredBuildingProvider";
import { ShadeAnalysisService } from "@/lib/environment/shade/service";
import { WindAnalysisService } from "@/lib/environment/wind/windService";
import { CompositeCandidateGenerator } from "@/lib/routing/generators/compositeCandidateGenerator";
import { CorridorWaypointGenerator } from "@/lib/routing/generators/corridorWaypointGenerator";
import { OsrmAlternativeGenerator } from "@/lib/routing/generators/osrmAlternativeGenerator";
import { OsrmWalkingProvider } from "@/lib/routing/providers/osrmWalkingProvider";
import { RoutingService } from "@/lib/routing/service";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";
import routes from "@/fixtures/routes/minneapolis-stage-5-5-routes.json";

type ValidationRow = {
  routeId: string;
  label: string;
  category: string;
  generationMode: string;
  success: boolean;
  elapsedMs: number;
  providerFailure: boolean;
  error?: string;
  generatedCandidateCount?: number;
  diverseCandidateCount?: number;
  comparableCandidateCount?: number;
  partialAnalysisCount?: number;
  buildingProviderMode?: string;
  loadedBuildings?: number;
  buildingQuerySucceeded?: boolean;
  comfortDiffersFromFastest?: boolean;
  noChangeReason?: string | null;
  rawCostRange?: number | null;
  overlapRange?: number | null;
  totalMs?: number;
  routingCandidatesMs?: number;
  weatherMs?: number;
  buildingFetchMs?: number;
  shadeMs?: number;
  windMs?: number;
  comfortMs?: number;
  rerankingMs?: number;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.localStore) {
    process.env.BUILDING_PROVIDER = "local-overture";
    process.env.BUILDING_LOCAL_OVERTURE_STORE_DIR = options.localStore;
  }

  const routingService = new RoutingService(
    new OsrmWalkingProvider({
      baseUrl:
        process.env.ROUTING_OSRM_BASE_URL ??
        process.env.ROUTING_BASE_URL ??
        "https://routing.openstreetmap.de/routed-foot",
    }),
  );
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
      new OsrmAlternativeGenerator(routingService),
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
  const modes = options.modes?.split(",") ?? ["osrm-only", "enhanced"];
  const rows: ValidationRow[] = [];

  for (const route of routes) {
    for (const mode of modes) {
      const startedAt = performance.now();
      try {
        const comparison = await comparisonService.compareWalkingRoutes({
          origin: route.origin,
          destination: route.destination,
          departureTime,
          generationMode: mode === "osrm-only" ? "osrm-only" : "enhanced",
          includeEnvironmentalDebug: false,
          generationPolicy: {
            maxEnvironmentAnalyzedCandidates: 5,
            maxCandidateAttempts: 8,
          },
        });
        rows.push(rowFromComparison(route, mode, comparison, Math.round(performance.now() - startedAt)));
      } catch (error) {
        rows.push({
          routeId: route.id,
          label: route.label,
          category: route.category,
          generationMode: mode,
          success: false,
          elapsedMs: Math.round(performance.now() - startedAt),
          providerFailure: true,
          error: error instanceof Error ? error.message : "Validation failed.",
        });
      }
    }
  }

  const report = {
    createdAt: new Date().toISOString(),
    routeCount: routes.length,
    providerMode: buildingProviderMode,
    summary: summarize(rows),
    rows,
  };

  if (options.output) {
    await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(report, null, 2));
}

function rowFromComparison(
  route: (typeof routes)[number],
  generationMode: string,
  comparison: Awaited<ReturnType<ComfortRouteComparisonService["compareWalkingRoutes"]>>,
  elapsedMs: number,
) {
  const candidates = comparison.debug.candidates;
  const comparableCandidates = candidates.filter((candidate) => candidate.comparable);

  return {
    routeId: route.id,
    label: route.label,
    category: route.category,
    generationMode,
    success: true,
    elapsedMs,
    providerFailure: false,
    generatedCandidateCount: comparison.debug.generation?.generatedCandidates ?? candidates.length,
    diverseCandidateCount: candidates.filter((candidate) => candidate.uniqueMeters >= 40).length,
    comparableCandidateCount: comparableCandidates.length,
    partialAnalysisCount: candidates.length - comparableCandidates.length,
    buildingProviderMode: comparison.debug.buildings?.providerMode ?? "unknown",
    loadedBuildings: comparison.debug.buildings?.loadedBuildings ?? 0,
    buildingQuerySucceeded: comparison.debug.buildings?.querySucceeded ?? false,
    comfortDiffersFromFastest: comparison.fastest.id !== comparison.comfort.id,
    noChangeReason:
      comparison.fastest.id !== comparison.comfort.id
        ? null
        : inferNoChangeReason(candidates),
    rawCostRange: range(comparableCandidates.map((candidate) => candidate.rawEnvironmentalCost)),
    overlapRange: range(candidates.map((candidate) => candidate.routeOverlapRatio)),
    totalMs: comparison.debug.performanceMs?.total ?? elapsedMs,
    routingCandidatesMs: comparison.debug.performanceMs?.routingCandidates ?? 0,
    weatherMs: comparison.debug.performanceMs?.weather ?? 0,
    buildingFetchMs: comparison.debug.performanceMs?.buildingFetch ?? 0,
    shadeMs: comparison.debug.performanceMs?.shadeAnalysis ?? 0,
    windMs: comparison.debug.performanceMs?.windAnalysis ?? 0,
    comfortMs: comparison.debug.performanceMs?.comfortAnalysis ?? 0,
    rerankingMs: comparison.debug.performanceMs?.reranking ?? 0,
  };
}

function summarize(rows: ValidationRow[]) {
  const successes = rows.filter((row) => row.success);
  const enhanced = successes.filter((row) => row.generationMode === "enhanced");
  const comfortDifferent = enhanced.filter((row) => row.comfortDiffersFromFastest);

  return {
    searchCount: rows.length,
    successCount: successes.length,
    providerFailureCount: rows.filter((row) => row.providerFailure).length,
    generatedCandidateAverage: average(successes.map((row) => row.generatedCandidateCount ?? 0)),
    diverseCandidateAverage: average(successes.map((row) => row.diverseCandidateCount ?? 0)),
    comparableCandidateAverage: average(successes.map((row) => row.comparableCandidateCount ?? 0)),
    partialAnalysisCount: successes.reduce((sum, row) => sum + (row.partialAnalysisCount ?? 0), 0),
    comfortDiffersFromFastestCount: comfortDifferent.length,
    comfortDiffersFromFastestRate:
      enhanced.length > 0 ? comfortDifferent.length / enhanced.length : 0,
    averageLoadedBuildings: average(successes.map((row) => row.loadedBuildings ?? 0)),
    averageTotalMs: average(successes.map((row) => row.totalMs ?? row.elapsedMs)),
    p95TotalMs: percentile(successes.map((row) => row.totalMs ?? row.elapsedMs), 0.95),
    averageBuildingFetchMs: average(successes.map((row) => row.buildingFetchMs ?? 0)),
    noChangeReasons: countBy(
      enhanced.flatMap((row) =>
        row.comfortDiffersFromFastest ? [] : [row.noChangeReason ?? "unknown"],
      ),
    ),
  };
}

function inferNoChangeReason(candidates: Array<{ comparable: boolean; uniqueMeters: number }>) {
  if (candidates.every((candidate) => !candidate.comparable)) return "candidate incomplete";
  if (candidates.filter((candidate) => candidate.uniqueMeters >= 40).length <= 1) {
    return "no meaningful candidate diversity";
  }
  return "fastest already best or insufficient improvement";
}

function range(values: Array<number | null>) {
  const numeric = values.filter((value): value is number => typeof value === "number");
  if (numeric.length < 2) return null;
  return Math.max(...numeric) - Math.min(...numeric);
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

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
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
