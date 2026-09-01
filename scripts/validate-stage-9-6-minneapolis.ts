import fs from "node:fs/promises";
import { ComfortRouteComparisonService } from "@/lib/comfort-routing/service";
import { createConfiguredBuildingProvider } from "@/lib/environment/buildings/providers/configuredBuildingProvider";
import { LocalOvertureBuildingProvider } from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";
import { ShadeAnalysisService } from "@/lib/environment/shade/service";
import { WindAnalysisService } from "@/lib/environment/wind/windService";
import { CompositeCandidateGenerator } from "@/lib/routing/generators/compositeCandidateGenerator";
import { CorridorWaypointGenerator } from "@/lib/routing/generators/corridorWaypointGenerator";
import { ProviderAlternativeGenerator } from "@/lib/routing/generators/providerAlternativeGenerator";
import { createConfiguredRoutingProvider } from "@/lib/routing/providers/configuredRoutingProvider";
import { RoutingService } from "@/lib/routing/service";
import {
  MINNEAPOLIS_WINTER_SCENARIOS,
  scenarioToWeatherBundle,
} from "@/lib/routing-research/environment/scenarios";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";
import type { WeatherBundle } from "@/lib/weather/types";
import routes from "@/fixtures/routes/minneapolis-stage-5-5-routes.json";

const DEFAULT_TIMEOUT_MS = 20_000;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.localStore) {
    process.env.BUILDING_PROVIDER = "local-overture";
    process.env.BUILDING_LOCAL_OVERTURE_STORE_DIR = options.localStore;
  }
  const routeLimit = options.limit ? Number(options.limit) : routes.length;
  const routeTimeoutMs = options.routeTimeoutMs
    ? Number(options.routeTimeoutMs)
    : DEFAULT_TIMEOUT_MS;
  const routeDelayMs = options.routeDelayMs ? Number(options.routeDelayMs) : 0;
  const departureTime = options.departureTime ?? new Date().toISOString();
  const suite = options.suite ?? "all";
  const winterScenarios = MINNEAPOLIS_WINTER_SCENARIOS.filter(
    (item) => item.id !== "WINTER_NIGHT",
  );
  if (
    suite !== "all" &&
    suite !== "live" &&
    !winterScenarios.some((scenario) => scenario.id === suite)
  ) {
    throw new Error(`Unknown Minneapolis validation suite "${suite}".`);
  }
  const { service, routingService, routingMetadata, buildingProviderMode } =
    createServices(options.localStore);
  const selectedRoutes = routes.slice(0, routeLimit);

  const liveRows =
    suite === "all" || suite === "live"
      ? await runSet({
          service,
          routingService,
          departureTime,
          routeTimeoutMs,
          routeDelayMs,
          routes: selectedRoutes,
        })
      : [];
  const controlledWinterResearch = [];
  for (const scenario of winterScenarios.filter(
    (item) => suite === "all" || item.id === suite,
  )) {
    const scenarioRows = await runSet({
      service,
      routingService,
      departureTime: scenario.timestamp,
      routeTimeoutMs,
      routeDelayMs,
      routes: selectedRoutes,
      weatherForRoute: (route) => scenarioToWeatherBundle(scenario, route.origin),
    });
    controlledWinterResearch.push({
      scenario: scenario.id,
      source: scenario.source,
      summary: summarize(scenarioRows),
      routes: scenarioRows,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    routingProvider: routingMetadata,
    buildingProviderMode,
    routeCount: selectedRoutes.length,
    routeTimeoutMs,
    routeDelayMs,
    suite,
    live:
      suite === "all" || suite === "live"
        ? {
            source: "National Weather Service",
            departureTime,
            summary: summarize(liveRows),
            routes: liveRows,
          }
        : null,
    controlledWinterResearch,
  };

  if (options.output) {
    await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
}

function createServices(localStore?: string) {
  const { provider: routingProvider, metadata: routingMetadata } =
    createConfiguredRoutingProvider();
  const routingService = new RoutingService(routingProvider);
  const weatherService = new WeatherService(
    new NwsWeatherProvider({
      baseUrl: process.env.WEATHER_BASE_URL,
      userAgent: process.env.WEATHER_USER_AGENT,
    }),
  );
  const { provider: buildingProvider, mode: buildingProviderMode } = localStore
    ? {
        provider: new LocalOvertureBuildingProvider({ storeDir: localStore }),
        mode: "local-overture" as const,
      }
    : createConfiguredBuildingProvider();
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
    buildingProviderMode,
  );
  return { service, routingService, routingMetadata, buildingProviderMode };
}

async function runSet({
  service,
  routingService,
  departureTime,
  routeTimeoutMs,
  routeDelayMs,
  routes: selectedRoutes,
  weatherForRoute,
}: {
  service: ComfortRouteComparisonService;
  routingService: RoutingService;
  departureTime: string;
  routeTimeoutMs: number;
  routeDelayMs: number;
  routes: typeof routes;
  weatherForRoute?: (route: (typeof routes)[number]) => WeatherBundle;
}) {
  const rows = [];
  for (const route of selectedRoutes) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), routeTimeoutMs);
    const startedAt = performance.now();
    try {
      const fastestStartedAt = performance.now();
      await routingService.getFastestWalkingRoute(
        {
          origin: route.origin,
          destination: route.destination,
          departureTime,
        },
        { signal: controller.signal },
      );
      const fastestMs = Math.round(performance.now() - fastestStartedAt);
      const comparison = await service.compareWalkingRoutes(
        {
          origin: route.origin,
          destination: route.destination,
          departureTime,
          weatherCoordinate: route.origin,
          weatherBundle: weatherForRoute?.(route),
          generationMode: "enhanced",
          generationPolicy: {
            maxCandidateAttempts: 4,
            maxConcurrentCandidateRequests: 3,
            maxEnvironmentAnalyzedCandidates: 5,
          },
        },
        { signal: controller.signal },
      );
      rows.push({
        routeId: route.id,
        label: route.label,
        success: true as const,
        context: comparison.debug.context?.context ?? null,
        routeLabel: comparison.debug.context?.routeLabel ?? null,
        fastestDiffers: comparison.fastest.id !== comparison.comfort.id,
        fastestMs,
        comfortMs: comparison.debug.performanceMs?.total ?? null,
        elapsedMs: Math.round(performance.now() - startedAt),
        candidateCount: comparison.candidates.length,
        comparableCandidates: comparison.debug.candidates.filter(
          (candidate) => candidate.comparable,
        ).length,
        routingUsage: {
          fastestRequests:
            1 + (comparison.debug.routingUsage?.fastestRequests ?? 0),
          candidateRequests: comparison.debug.routingUsage?.candidateRequests ?? 0,
          failedRequests: comparison.debug.routingUsage?.failedRequests ?? 0,
          totalRequests: 1 + (comparison.debug.routingUsage?.totalRequests ?? 0),
        },
      });
    } catch (error) {
      rows.push({
        routeId: route.id,
        label: route.label,
        success: false as const,
        error: error instanceof Error ? error.message : "validation failed",
      });
    } finally {
      clearTimeout(timeout);
    }
    console.error(`Completed ${rows.length}/${selectedRoutes.length}: ${route.id}`);
    if (routeDelayMs > 0) await delay(routeDelayMs);
  }
  return rows;
}

function summarize(results: Awaited<ReturnType<typeof runSet>>) {
  const successes = results.filter((result) => result.success);
  const different = successes.filter((result) => result.fastestDiffers);
  return {
    searches: results.length,
    success: successes.length,
    failures: results.length - successes.length,
    contexts: Object.fromEntries(
      [...new Set(successes.map((result) => result.context))].map((context) => [
        context ?? "unknown",
        successes.filter((result) => result.context === context).length,
      ]),
    ),
    fastestDiffers: different.length,
    fastestSame: successes.length - different.length,
    limitedData: successes.filter((result) => result.comparableCandidates === 0).length,
    fastestLatencyMs: stats(successes.map((result) => result.fastestMs)),
    comfortLatencyMs: stats(
      successes.flatMap((result) =>
        typeof result.comfortMs === "number" ? [result.comfortMs] : [],
      ),
    ),
    managedRoutingRequests: stats(
      successes.map((result) => result.routingUsage.totalRequests),
    ),
  };
}

function stats(values: number[]) {
  if (values.length === 0) {
    return { average: null, median: null, p95: null, max: null };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const at = (ratio: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
  return {
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    median: at(0.5),
    p95: at(0.95),
    max: Math.max(...values),
  };
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
