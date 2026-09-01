import fs from "node:fs/promises";
import { ComfortRouteComparisonService } from "@/lib/comfort-routing/service";
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
import type { WeatherBundle } from "@/lib/weather/types";
import {
  CONTROLLED_HEAT_SCENARIOS,
  heatScenarioToWeatherBundle,
} from "@/lib/routing-research/environment/heatScenarios";

type ValidationRoute = {
  id: string;
  label: string;
  origin: Coordinate;
  destination: Coordinate;
};

const DEFAULT_ROUTE_FILE = "config/validation-routes/phoenix-stage9.json";
const DEFAULT_SHADE_ROUTE_FILE = "config/validation-routes/phoenix-stage9-shade-rich.json";
const DEFAULT_STORE = "/tmp/comfortos-overture-phoenix-store";
const DEFAULT_ROUTE_TIMEOUT_MS = 24_000;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const routes = await readRoutes(options.routes ?? DEFAULT_ROUTE_FILE, options.limit);
  const shadeRichRoutes = await readRoutes(
    options.shadeRoutes ?? DEFAULT_SHADE_ROUTE_FILE,
    options.shadeLimit,
  );
  const departureTime = options.departureTime ?? new Date().toISOString();
  const buildingStore = options.localStore ?? DEFAULT_STORE;
  const routeTimeoutMs = options.routeTimeoutMs
    ? Number(options.routeTimeoutMs)
    : DEFAULT_ROUTE_TIMEOUT_MS;
  const routeDelayMs = options.routeDelayMs ? Number(options.routeDelayMs) : 0;
  const suite = options.suite ?? "all";
  if (
    suite !== "all" &&
    suite !== "live" &&
    !CONTROLLED_HEAT_SCENARIOS.some((scenario) => scenario.id === suite)
  ) {
    throw new Error(`Unknown Phoenix validation suite "${suite}".`);
  }
  const { service, routingMetadata } = createComparisonService(buildingStore);

  const liveResults =
    suite === "all" || suite === "live"
      ? await runValidation({
          service,
          routes,
          departureTime,
          routeTimeoutMs,
          routeDelayMs,
        })
      : [];
  const controlledHeatResearch = [];
  for (const scenario of CONTROLLED_HEAT_SCENARIOS.filter(
    (item) => suite === "all" || item.id === suite,
  )) {
    const scenarioResults = await runValidation({
      service,
      routes,
      departureTime: scenario.timestamp,
      routeTimeoutMs,
      routeDelayMs,
      weatherBundleForRoute: (route) => heatScenarioToWeatherBundle(scenario, route.origin),
    });
    const shadeRichResults = await runValidation({
      service,
      routes: shadeRichRoutes,
      departureTime: scenario.timestamp,
      routeTimeoutMs,
      routeDelayMs,
      weatherBundleForRoute: (route) => heatScenarioToWeatherBundle(scenario, route.origin),
    });
    controlledHeatResearch.push({
      scenario: scenario.id,
      source: scenario.source,
      summary: summarizeResults(scenarioResults),
      shadeRichSummary: summarizeResults(shadeRichResults),
      routes: scenarioResults,
      shadeRichRoutes: shadeRichResults,
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    routeCount: routes.length,
    shadeRichRouteCount: shadeRichRoutes.length,
    buildingStore,
    routeDelayMs,
    suite,
    routingProvider: routingMetadata,
    live:
      suite === "all" || suite === "live"
        ? {
            source: "National Weather Service",
            departureTime,
            summary: summarizeResults(liveResults),
            routes: liveResults,
          }
        : null,
    controlledHeatResearch,
  };

  if (options.output) {
    await fs.writeFile(options.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(payload, null, 2));
}

async function readRoutes(filePath: string, limitValue?: string) {
  const routes = JSON.parse(await fs.readFile(filePath, "utf8")) as ValidationRoute[];
  return routes.slice(0, limitValue ? Number(limitValue) : routes.length);
}

function createComparisonService(buildingStore: string) {
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
  );
  return { service, routingMetadata };
}

async function runValidation({
  service,
  routes,
  departureTime,
  routeTimeoutMs,
  routeDelayMs,
  weatherBundleForRoute,
}: {
  service: ComfortRouteComparisonService;
  routes: ValidationRoute[];
  departureTime: string;
  routeTimeoutMs: number;
  routeDelayMs: number;
  weatherBundleForRoute?: (route: ValidationRoute) => WeatherBundle;
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
          weatherBundle: weatherBundleForRoute?.(route),
          generationMode: "enhanced",
          generationPolicy: {
            maxCandidateAttempts: 4,
            maxConcurrentCandidateRequests: 3,
            maxEnvironmentAnalyzedCandidates: 5,
          },
        },
        routeTimeoutMs,
      );
      const fastest = comparison.fastest;
      const comfort = comparison.comfort;
      results.push({
        id: route.id,
        label: route.label,
        success: true as const,
        elapsedMs: Math.round(performance.now() - startedAt),
        context: comparison.debug.context?.context ?? null,
        profile: comparison.debug.context?.profile ?? null,
        routeLabel: comparison.debug.context?.routeLabel ?? null,
        heatCapable: comparison.debug.context?.heatCapable ?? null,
        fastestDiffers: fastest.id !== comfort.id,
        candidateCount: comparison.candidates.length,
        routingUsage: comparison.debug.routingUsage ?? null,
        performanceMs: comparison.debug.performanceMs ?? null,
        fastest: routeMetrics(fastest),
        comfort: routeMetrics(comfort),
        delta: {
          extraDurationSeconds: comfort.metrics.extraDurationSeconds,
          extraDistanceMeters: comfort.metrics.extraDistanceMeters,
          rawHeatCostReductionRatio: comfort.metrics.environmentalCostReductionRatio,
          heatExposureReduction:
            differenceRatio(
              fastest.heatAnalysis?.summary.averageHeatExposure,
              comfort.heatAnalysis?.summary.averageHeatExposure,
            ) ?? null,
          directSunReduction:
            differenceRatio(
              fastest.heatAnalysis?.summary.directSunRatio,
              comfort.heatAnalysis?.summary.directSunRatio,
            ) ?? null,
          shadeIncrease:
            differenceValue(
              comfort.heatAnalysis?.summary.shadeRatio,
              fastest.heatAnalysis?.summary.shadeRatio,
            ) ?? null,
        },
      });
    } catch (error) {
      results.push({
        id: route.id,
        label: route.label,
        success: false as const,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
    console.error(`Completed ${results.length}/${routes.length}: ${route.id}`);
    if (routeDelayMs > 0) await delay(routeDelayMs);
  }
  return results;
}

function routeMetrics(candidate: Awaited<ReturnType<ComfortRouteComparisonService["compareWalkingRoutes"]>>["fastest"]) {
  return {
    id: candidate.id,
    role: candidate.role,
    durationSeconds: candidate.route.durationSeconds,
    distanceMeters: candidate.route.distanceMeters,
    rawEnvironmentalCost: candidate.comfortAnalysis?.routeComfortCost.environmentalExposureCost ?? null,
    averageEnvironmentalCost: candidate.comfortAnalysis?.routeComfortCost.averageEnvironmentalCost ?? null,
    comparable: candidate.comfortAnalysis?.routeComfortCost.comparable ?? false,
    confidence: candidate.comfortAnalysis?.routeComfortCost.confidence ?? null,
    completeness: candidate.comfortAnalysis?.routeComfortCost.completeness ?? null,
    heatExposure: candidate.heatAnalysis?.summary.averageHeatExposure ?? null,
    directSunRatio: candidate.heatAnalysis?.summary.directSunRatio ?? null,
    shadeRatio: candidate.heatAnalysis?.summary.shadeRatio ?? null,
    longestContinuousSunMeters: candidate.heatAnalysis?.summary.longestContinuousSunMeters ?? null,
    longestContinuousSunSeconds: candidate.heatAnalysis?.summary.longestContinuousSunSeconds ?? null,
  };
}

function summarizeResults(results: Awaited<ReturnType<typeof runValidation>>) {
  const successes = results.filter((result) => result.success);
  const heatContexts = successes.filter((result) => result.context === "heat");
  const reranked = successes.filter((result) => result.fastestDiffers);
  const comparable = successes.filter((result) => result.comfort.comparable);

  return {
    attempted: results.length,
    successes: successes.length,
    failures: results.length - successes.length,
    heatContexts: heatContexts.length,
    rerankedRoutes: reranked.length,
    comparableRoutes: comparable.length,
    stayCoolSameAsFastest: successes.length - reranked.length,
    averageExtraDurationSeconds: average(reranked.map((result) => result.delta.extraDurationSeconds)),
    averageHeatExposureReduction: average(
      reranked.flatMap((result) =>
        result.delta.heatExposureReduction === null ? [] : [result.delta.heatExposureReduction],
      ),
    ),
    averageDirectSunReduction: average(
      reranked.flatMap((result) =>
        result.delta.directSunReduction === null ? [] : [result.delta.directSunReduction],
      ),
    ),
    averageShadeIncrease: average(
      reranked.flatMap((result) =>
        result.delta.shadeIncrease === null ? [] : [result.delta.shadeIncrease],
      ),
    ),
    maxLongestSunnyRunMeters: Math.max(
      0,
      ...successes.flatMap((result) =>
        result.comfort.longestContinuousSunMeters === null
          ? []
          : [result.comfort.longestContinuousSunMeters],
      ),
    ),
    latencyMs: stats(successes.map((result) => result.elapsedMs)),
    fastestRoutingMs: stats(
      successes.flatMap((result) =>
        typeof result.performanceMs?.fastestRoute === "number"
          ? [result.performanceMs.fastestRoute]
          : [],
      ),
    ),
    fullComfortMs: stats(
      successes.flatMap((result) =>
        typeof result.performanceMs?.total === "number"
          ? [result.performanceMs.total]
          : [],
      ),
    ),
    managedRoutingRequests: stats(
      successes.flatMap((result) =>
        typeof result.routingUsage?.totalRequests === "number"
          ? [result.routingUsage.totalRequests]
          : [],
      ),
    ),
  };
}

function compareWithTimeout(
  service: ComfortRouteComparisonService,
  request: Parameters<ComfortRouteComparisonService["compareWalkingRoutes"]>[0],
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return service
    .compareWalkingRoutes(request, { signal: controller.signal })
    .finally(() => clearTimeout(timeout));
}

function differenceRatio(before?: number | null, after?: number | null) {
  if (typeof before !== "number" || typeof after !== "number" || before <= 0) return null;
  return Math.max(0, (before - after) / before);
}

function differenceValue(left?: number | null, right?: number | null) {
  if (typeof left !== "number" || typeof right !== "number") return null;
  return left - right;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stats(values: number[]) {
  if (values.length === 0) {
    return { average: null, median: null, p95: null, max: null };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const at = (ratio: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
  return {
    average: average(values),
    median: at(0.5),
    p95: at(0.95),
    max: Math.max(...values),
  };
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseArgs(args: string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg
      .slice(2)
      .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
