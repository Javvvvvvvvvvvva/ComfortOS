import fs from "node:fs/promises";
import { ComfortRouteComparisonService } from "@/lib/comfort-routing/service";
import { StaticCoveredFeatureProvider } from "@/lib/environment/coveredFeatures/providers/staticCoveredFeatureProvider";
import { LocalOvertureBuildingProvider } from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";
import { ShadeAnalysisService } from "@/lib/environment/shade/service";
import { WindAnalysisService } from "@/lib/environment/wind/windService";
import { CompositeCandidateGenerator } from "@/lib/routing/generators/compositeCandidateGenerator";
import { CorridorWaypointGenerator } from "@/lib/routing/generators/corridorWaypointGenerator";
import { ProviderAlternativeGenerator } from "@/lib/routing/generators/providerAlternativeGenerator";
import { createConfiguredRoutingProvider } from "@/lib/routing/providers/configuredRoutingProvider";
import { RoutingService } from "@/lib/routing/service";
import type { Coordinate } from "@/lib/geo/types";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";
import {
  CONTROLLED_RAIN_SCENARIOS,
  rainScenarioToWeatherBundle,
} from "@/lib/routing-research/environment/rainScenarios";

type ValidationRoute = {
  id: string;
  label: string;
  origin: Coordinate;
  destination: Coordinate;
};

type Stage8RouteResult =
  | ReturnType<typeof routeResult>
  | {
      id: string;
      label: string;
      success: false;
      error: string;
    };

const DEFAULT_ROUTE_FILE = "config/validation-routes/seattle-stage8.json";
const DEFAULT_COVERED_FEATURE_FILE = "/tmp/comfortos-seattle-covered-features.geojson";
const DEFAULT_STORE = "/tmp/comfortos-overture-seattle-store";
const DEFAULT_ROUTE_TIMEOUT_MS = 20_000;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const routes = JSON.parse(
    await fs.readFile(options.routes ?? DEFAULT_ROUTE_FILE, "utf8"),
  ) as ValidationRoute[];
  const limit = options.limit ? Number(options.limit) : routes.length;
  const selectedRoutes = routes.slice(0, limit);
  const departureTime = options.departureTime ?? new Date().toISOString();
  const output = options.output;
  const coveredFeatureFile = options.coveredFeatures ?? DEFAULT_COVERED_FEATURE_FILE;
  const buildingStore = options.localStore ?? DEFAULT_STORE;
  const { service, routingMetadata } = createComparisonService({
    buildingStore,
    coveredFeatureFile,
  });
  const routeTimeoutMs = options.routeTimeoutMs
    ? Number(options.routeTimeoutMs)
    : DEFAULT_ROUTE_TIMEOUT_MS;

  const liveResults = await runLiveValidation({
    service,
    routes: selectedRoutes,
    departureTime,
    routeTimeoutMs,
  });
  const controlledResults = [];
  for (const scenario of CONTROLLED_RAIN_SCENARIOS) {
    const scenarioResults = await runControlledValidation({
      service,
      routes: selectedRoutes,
      scenario,
      routeTimeoutMs,
    });
    controlledResults.push({
      scenario: scenario.id,
      source: scenario.source,
      summary: summarizeResults(scenarioResults),
      routes: scenarioResults,
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    routeCount: selectedRoutes.length,
    buildingStore,
    coveredFeatureFile,
    routingProvider: routingMetadata,
    live: {
      source: "National Weather Service",
      departureTime,
      summary: summarizeResults(liveResults),
      routes: liveResults,
    },
    controlledRainResearch: controlledResults,
  };

  if (output) await fs.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(payload, null, 2));
}

function createComparisonService({
  buildingStore,
  coveredFeatureFile,
}: {
  buildingStore: string;
  coveredFeatureFile: string;
}) {
  const { provider: routingProvider, metadata: routingMetadata } =
    createConfiguredRoutingProvider();
  const routingService = new RoutingService(routingProvider);
  const buildingProvider = new LocalOvertureBuildingProvider({ storeDir: buildingStore });
  const weatherService = new WeatherService(
    new NwsWeatherProvider({
      baseUrl: process.env.WEATHER_BASE_URL,
      userAgent: process.env.WEATHER_USER_AGENT,
    }),
  );
  const service = new ComfortRouteComparisonService(
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
    "local-overture",
    new StaticCoveredFeatureProvider({
      filePath: coveredFeatureFile,
      region: "seattle-central-covered-feature-audit",
    }),
    "static-osm",
  );
  return { service, routingMetadata };
}

async function runLiveValidation({
  service,
  routes,
  departureTime,
  routeTimeoutMs,
}: {
  service: ComfortRouteComparisonService;
  routes: ValidationRoute[];
  departureTime: string;
  routeTimeoutMs: number;
}) {
  const results = [];
  for (const route of routes) {
    const startedAt = performance.now();
    try {
      const comparison = await compareWithTimeout(
        service,
        {
          origin: route.origin,
          destination: route.destination,
          departureTime,
          weatherCoordinate: route.origin,
          generationMode: "enhanced",
          generationPolicy: {
            maxCandidateAttempts: 4,
            maxConcurrentCandidateRequests: 3,
            maxEnvironmentAnalyzedCandidates: 5,
          },
        },
        routeTimeoutMs,
      );
      results.push(routeResult(route, comparison, Math.round(performance.now() - startedAt)));
    } catch (error) {
      results.push({
        id: route.id,
        label: route.label,
        success: false as const,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return results;
}

async function runControlledValidation({
  service,
  routes,
  scenario,
  routeTimeoutMs,
}: {
  service: ComfortRouteComparisonService;
  routes: ValidationRoute[];
  scenario: (typeof CONTROLLED_RAIN_SCENARIOS)[number];
  routeTimeoutMs: number;
}) {
  const results = [];
  for (const route of routes) {
    const startedAt = performance.now();
    try {
      const comparison = await compareWithTimeout(
        service,
        {
          origin: route.origin,
          destination: route.destination,
          departureTime: scenario.timestamp,
          weatherCoordinate: route.origin,
          weatherBundle: rainScenarioToWeatherBundle(scenario, route.origin),
          generationMode: "enhanced",
          generationPolicy: {
            maxCandidateAttempts: 4,
            maxConcurrentCandidateRequests: 3,
            maxEnvironmentAnalyzedCandidates: 5,
          },
        },
        routeTimeoutMs,
      );
      results.push(routeResult(route, comparison, Math.round(performance.now() - startedAt)));
    } catch (error) {
      results.push({
        id: route.id,
        label: route.label,
        success: false as const,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return results;
}

async function compareWithTimeout(
  service: ComfortRouteComparisonService,
  request: Parameters<ComfortRouteComparisonService["compareWalkingRoutes"]>[0],
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await service.compareWalkingRoutes(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function routeResult(
  route: ValidationRoute,
  comparison: Awaited<ReturnType<ComfortRouteComparisonService["compareWalkingRoutes"]>>,
  elapsedMs: number,
) {
  const fastestRain = comparison.fastest.rainAnalysis?.summary;
  const comfortRain = comparison.comfort.rainAnalysis?.summary;
  return {
    id: route.id,
    label: route.label,
    success: true as const,
    context: comparison.debug.context?.context,
    routeLabel: comparison.debug.context?.routeLabel,
    rainCapable: comparison.debug.context?.rainCapable,
    fastestEqualsComfort: comparison.fastest.id === comparison.comfort.id,
    fastestDurationSeconds: comparison.fastest.route.durationSeconds,
    comfortDurationSeconds: comparison.comfort.route.durationSeconds,
    extraDurationSeconds: Math.max(
      0,
      comparison.comfort.route.durationSeconds - comparison.fastest.route.durationSeconds,
    ),
    fastestRainExposure: fastestRain?.averageRainExposure ?? null,
    comfortRainExposure: comfortRain?.averageRainExposure ?? null,
    rainExposureReduction:
      fastestRain && comfortRain && fastestRain.averageRainExposure > 0
        ? Math.max(
            0,
            (fastestRain.averageRainExposure - comfortRain.averageRainExposure) /
              fastestRain.averageRainExposure,
          )
        : 0,
    coveredMeters: comfortRain?.coveredMeters ?? null,
    exposedMeters: comfortRain?.exposedMeters ?? null,
    unknownMeters: comfortRain?.unknownMeters ?? null,
    limitedData: !comparison.candidates.some(
      (candidate) => candidate.comfortAnalysis?.routeComfortCost.comparable,
    ),
    coveredFeatureCount: comparison.debug.coveredFeatures?.loadedFeatures ?? null,
    buildingRegion: comparison.debug.buildings?.region,
    performanceMs: comparison.debug.performanceMs,
    routingUsage: comparison.debug.routingUsage,
    elapsedMs,
  };
}

function summarizeResults(results: Stage8RouteResult[]) {
  const successes = results.filter((result) => result.success) as Array<
    ReturnType<typeof routeResult>
  >;
  const different = successes.filter((result) => !result.fastestEqualsComfort);
  return {
    searches: results.length,
    success: successes.length,
    failures: results.length - successes.length,
    limitedData: successes.filter((result) => result.limitedData).length,
    stayDryContexts: successes.filter((result) => result.context === "rain").length,
    fastestDiffers: different.length,
    fastestSame: successes.length - different.length,
    averageExtraDurationWhereDifferent:
      average(different.map((result) => result.extraDurationSeconds)) ?? 0,
    averageRainExposureReductionWhereDifferent:
      average(different.map((result) => result.rainExposureReduction)) ?? 0,
    averageComfortMs: average(
      successes.flatMap((result) =>
        typeof result.performanceMs?.total === "number" ? [result.performanceMs.total] : [],
      ),
    ),
    p95ComfortMs: percentile(
      successes.flatMap((result) =>
        typeof result.performanceMs?.total === "number" ? [result.performanceMs.total] : [],
      ),
      0.95,
    ),
    maxComfortMs: Math.max(
      0,
      ...successes.flatMap((result) =>
        typeof result.performanceMs?.total === "number" ? [result.performanceMs.total] : [],
      ),
    ),
    averageManagedRoutingRequests: average(
      successes.flatMap((result) =>
        typeof result.routingUsage?.totalRequests === "number"
          ? [result.routingUsage.totalRequests]
          : [],
      ),
    ),
    averageCoveredFeatureCount: average(
      successes.flatMap((result) =>
        typeof result.coveredFeatureCount === "number" ? [result.coveredFeatureCount] : [],
      ),
    ),
  };
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function parseArgs(args: string[]) {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith("--")) throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}.`);
    }
    options[toCamelCase(key.slice(2))] = value;
    index += 1;
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
