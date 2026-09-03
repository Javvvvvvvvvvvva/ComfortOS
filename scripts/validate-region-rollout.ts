import fs from "node:fs/promises";
import { ComfortRouteComparisonService } from "@/lib/comfort-routing/service";
import { createConfiguredBuildingProvider } from "@/lib/environment/buildings/providers/configuredBuildingProvider";
import { createConfiguredCoveredFeatureProvider } from "@/lib/environment/coveredFeatures/providers/configuredCoveredFeatureProvider";
import { ShadeAnalysisService } from "@/lib/environment/shade/service";
import { WindAnalysisService } from "@/lib/environment/wind/windService";
import type { Coordinate } from "@/lib/geo/types";
import { CompositeCandidateGenerator } from "@/lib/routing/generators/compositeCandidateGenerator";
import { CorridorWaypointGenerator } from "@/lib/routing/generators/corridorWaypointGenerator";
import { ProviderAlternativeGenerator } from "@/lib/routing/generators/providerAlternativeGenerator";
import { createConfiguredRoutingProvider } from "@/lib/routing/providers/configuredRoutingProvider";
import { RoutingService } from "@/lib/routing/service";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";
import type { WeatherBundle } from "@/lib/weather/types";

type RouteScenario = {
  id: string;
  label: string;
  origin: Coordinate;
  destination: Coordinate;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const routesPath = requireOption(options.routes, "--routes");
  const routes = validateRoutes(
    JSON.parse(await fs.readFile(routesPath, "utf8")) as unknown,
  );
  if (options.controlledWeather && options.controlledWeather !== "heat") {
    throw new Error("--controlled-weather currently supports only 'heat'.");
  }
  const departureTime =
    options.departureTime ??
    (options.controlledWeather === "heat"
      ? "2026-07-15T19:00:00.000Z"
      : new Date().toISOString());
  const maxCandidateAttempts = positiveInteger(options.maxCandidateAttempts, 4);
  const maxEnvironmentAnalyzedCandidates = positiveInteger(
    options.maxEnvironmentAnalyzedCandidates,
    3,
  );

  const { provider: routingProvider, metadata: routingMetadata } =
    createConfiguredRoutingProvider();
  const { provider: buildingProvider, mode: buildingProviderMode } =
    createConfiguredBuildingProvider();
  const { provider: coveredFeatureProvider, mode: coveredFeatureProviderMode } =
    createConfiguredCoveredFeatureProvider();
  const routingService = new RoutingService(routingProvider);
  const weatherService = new WeatherService(
    new NwsWeatherProvider({
      baseUrl: process.env.WEATHER_BASE_URL,
      userAgent: process.env.WEATHER_USER_AGENT,
    }),
  );
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
    coveredFeatureProvider,
    coveredFeatureProviderMode,
  );

  const rows = [];
  for (const route of routes) {
    const startedAt = performance.now();
    try {
      const comparison = await comparisonService.compareWalkingRoutes({
        origin: route.origin,
        destination: route.destination,
        departureTime,
        weatherBundle:
          options.controlledWeather === "heat"
            ? controlledHeatWeather(route.origin, departureTime)
            : undefined,
        generationMode: "enhanced",
        includeEnvironmentalDebug: false,
        generationPolicy: {
          maxCandidateAttempts,
          maxEnvironmentAnalyzedCandidates,
        },
      });
      const comparableCandidates = comparison.candidates.filter(
        (candidate) => candidate.comfortAnalysis?.routeComfortCost.comparable,
      );
      rows.push({
        id: route.id,
        label: route.label,
        success: true,
        elapsedMs: Math.round(performance.now() - startedAt),
        candidateCount: comparison.candidates.length,
        comparableCandidateCount: comparableCandidates.length,
        buildingQuerySucceeded: comparison.debug.buildings?.querySucceeded ?? false,
        loadedBuildings: comparison.debug.buildings?.loadedBuildings ?? 0,
        buildingRegion: comparison.debug.buildings?.region,
        fastestRouteId: comparison.fastest.id,
        comfortRouteId: comparison.comfort.id,
        comfortDiffersFromFastest: comparison.fastest.id !== comparison.comfort.id,
        context: comparison.debug.context,
        capabilities: comparison.debug.capabilities,
        diversity: comparison.debug.generation?.diversity,
        heightCoverage: comparison.debug.buildings
          ? {
              explicit: comparison.debug.buildings.explicitHeightBuildings,
              floorsDerived:
                comparison.debug.buildings.floorDerivedHeightBuildings,
              unknown: comparison.debug.buildings.unknownHeightBuildings,
            }
          : null,
        averageCompleteness: average(
          comparableCandidates.map(
            (candidate) =>
              candidate.comfortAnalysis?.routeComfortCost.completeness ?? 0,
          ),
        ),
        averageConfidence: average(
          comparableCandidates.map(
            (candidate) => candidate.comfortAnalysis?.routeComfortCost.confidence ?? 0,
          ),
        ),
        performanceMs: comparison.debug.performanceMs,
      });
    } catch (error) {
      rows.push({
        id: route.id,
        label: route.label,
        success: false,
        elapsedMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : "Region validation failed.",
      });
    }
  }

  const successes = rows.filter((row) => row.success);
  const accepted =
    successes.length === routes.length &&
    successes.every(
      (row) =>
        row.buildingQuerySucceeded === true &&
        (row.comparableCandidateCount ?? 0) > 0 &&
        row.buildingRegion !== "unsupported",
    );
  const report = {
    createdAt: new Date().toISOString(),
    departureTime,
    controlledWeather: options.controlledWeather ?? null,
    routesPath,
    routingProvider: {
      id: routingMetadata.id,
      mode: routingMetadata.mode,
      endpointFamily: routingMetadata.endpointFamily,
    },
    buildingProviderMode,
    generationPolicy: {
      maxCandidateAttempts,
      maxEnvironmentAnalyzedCandidates,
    },
    summary: {
      routeCount: routes.length,
      successCount: successes.length,
      failureCount: routes.length - successes.length,
      buildingQuerySuccessCount: successes.filter(
        (row) => row.buildingQuerySucceeded,
      ).length,
      comparableRouteCount: successes.filter(
        (row) => (row.comparableCandidateCount ?? 0) > 0,
      ).length,
      comfortDiffersFromFastestCount: successes.filter(
        (row) => row.comfortDiffersFromFastest,
      ).length,
      averageElapsedMs: average(successes.map((row) => row.elapsedMs)),
      averageLoadedBuildings: average(
        successes.map((row) => row.loadedBuildings ?? 0),
      ),
      accepted,
    },
    rows,
  };

  if (options.output) {
    await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
  if (!accepted) process.exitCode = 1;
}

function controlledHeatWeather(
  coordinate: Coordinate,
  timestamp: string,
): WeatherBundle {
  return {
    coordinate,
    current: {
      timestamp,
      temperatureC: 38,
      apparentTemperatureC: 39,
      relativeHumidity: 35,
      windSpeedMps: 3,
      windDirectionDeg: 225,
      precipitationProbability: 0,
      precipitationMmPerHour: 0,
      cloudCover: 5,
      shortCondition: "Sunny",
      source: "Controlled rollout validation",
      confidence: 1,
    },
    hourlyForecast: [],
    alerts: [],
    source: "Controlled rollout validation",
    updatedAt: timestamp,
  };
}

function validateRoutes(value: unknown): RouteScenario[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Route validation file must contain at least one route.");
  }
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid route scenario.");
    const route = item as Partial<RouteScenario>;
    if (
      typeof route.id !== "string" ||
      typeof route.label !== "string" ||
      !validCoordinate(route.origin) ||
      !validCoordinate(route.destination)
    ) {
      throw new Error("Invalid route scenario.");
    }
    return route as RouteScenario;
  });
}

function validCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== "object") return false;
  const coordinate = value as Partial<Coordinate>;
  return (
    typeof coordinate.latitude === "number" &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    typeof coordinate.longitude === "number" &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
  );
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function positiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Validation limits must be positive integers.");
  }
  return parsed;
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

function requireOption(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
