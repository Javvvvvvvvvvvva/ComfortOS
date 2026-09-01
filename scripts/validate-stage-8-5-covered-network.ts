import fs from "node:fs/promises";
import type { LineString, Polygon } from "geojson";
import { ComfortRouteComparisonService } from "@/lib/comfort-routing/service";
import { StaticCoveredFeatureProvider } from "@/lib/environment/coveredFeatures/providers/staticCoveredFeatureProvider";
import type { CoveredFeature } from "@/lib/environment/coveredFeatures/types";
import { isRainCoverEligible } from "@/lib/environment/coveredFeatures/semantics";
import {
  analyzeRouteCoverMetrics,
  routeLengthMeters,
} from "@/lib/environment/coveredFeatures/routeCoverMetrics";
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
  area?: SeattleValidationArea;
  origin: Coordinate;
  destination: Coordinate;
};

type SeattleValidationArea =
  | "Downtown"
  | "Belltown"
  | "South Lake Union"
  | "Capitol Hill"
  | "University District"
  | "Waterfront";

const DEFAULT_GENERAL_ROUTE_FILE = "config/validation-routes/seattle-stage8.json";
const DEFAULT_COVER_RICH_ROUTE_FILE =
  "config/validation-routes/seattle-stage8-cover-rich.json";
const DEFAULT_COVERED_FEATURE_FILE = "/tmp/comfortos-seattle-covered-features.geojson";
const DEFAULT_STORE = "/tmp/comfortos-overture-seattle-store";
const DEFAULT_ROUTE_TIMEOUT_MS = 12_000;

const AREA_BOUNDS: Record<SeattleValidationArea, [number, number, number, number]> = {
  Downtown: [-122.345, 47.595, -122.325, 47.615],
  Belltown: [-122.36, 47.612, -122.34, 47.626],
  "South Lake Union": [-122.35, 47.618, -122.325, 47.633],
  "Capitol Hill": [-122.325, 47.608, -122.305, 47.628],
  "University District": [-122.325, 47.65, -122.295, 47.67],
  Waterfront: [-122.355, 47.598, -122.335, 47.616],
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const coveredFeatureFile = options.coveredFeatures ?? DEFAULT_COVERED_FEATURE_FILE;
  const buildingStore = options.localStore ?? DEFAULT_STORE;
  const generalRoutes = await readRoutes(options.routes ?? DEFAULT_GENERAL_ROUTE_FILE);
  const coverRichRoutes = await readRoutes(
    options.coverRichRoutes ?? DEFAULT_COVER_RICH_ROUTE_FILE,
  );
  const routeTimeoutMs = options.routeTimeoutMs
    ? Number(options.routeTimeoutMs)
    : DEFAULT_ROUTE_TIMEOUT_MS;
  const routeDelayMs = options.routeDelayMs ? Number(options.routeDelayMs) : 0;
  const scenarioFilter = options.scenario;
  const selectedScenarios = scenarioFilter
    ? CONTROLLED_RAIN_SCENARIOS.filter((scenario) => scenario.id === scenarioFilter)
    : CONTROLLED_RAIN_SCENARIOS;
  if (scenarioFilter && selectedScenarios.length === 0) {
    throw new Error(`Unknown Seattle rain scenario "${scenarioFilter}".`);
  }
  const generalLimit = options.generalLimit ? Number(options.generalLimit) : generalRoutes.length;
  const coverRichLimit = options.coverRichLimit
    ? Number(options.coverRichLimit)
    : coverRichRoutes.length;
  const selectedGeneral = generalRoutes.slice(0, generalLimit);
  const selectedCoverRich = coverRichRoutes.slice(0, coverRichLimit);

  const features = await loadCoveredFeatures(coveredFeatureFile);
  const { service, routingMetadata } = createComparisonService({
    buildingStore,
    coveredFeatureFile,
  });
  const featureAudit = auditFeatures(features);
  const areaCoverage =
    options.skipAreaCoverage === "true"
      ? null
      : await measureAreaCoverage({
          service,
          features,
          routes: selectedGeneral,
          routeTimeoutMs,
          routeDelayMs,
        });

  const controlledRainResearch = [];
  for (const scenario of selectedScenarios) {
    controlledRainResearch.push({
      scenario: scenario.id,
      source: scenario.source,
      general: await runControlledSet({
        service,
        routes: selectedGeneral,
        sample: "general",
        scenario,
        routeTimeoutMs,
        routeDelayMs,
      }),
      coverRich: await runControlledSet({
        service,
        routes: selectedCoverRich,
        sample: "cover-rich",
        scenario,
        routeTimeoutMs,
        routeDelayMs,
      }),
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    buildingStore,
    coveredFeatureFile,
    routeTimeoutMs,
    routeDelayMs,
    scenarioFilter: scenarioFilter ?? null,
    sourceInventory: {
      coveredFeatures: "OpenStreetMap/Overpass static extract",
      buildings: "Overture Maps local Seattle store",
      routing: `${routingMetadata.name} / ${routingMetadata.mode}`,
      weather: "Controlled rain research scenarios only in this Stage 8.5 run",
    },
    osmTagsSupported: [
      "covered=yes",
      "covered=arcade",
      "covered=colonnade",
      "tunnel=building_passage",
      "tunnel=yes on pedestrian ways",
      "indoor=yes on explicitly public/permissive pedestrian connectors",
      "covered transit platforms and station-adjacent pedestrian ways",
      "access/foot/private/customers/permissive restrictions",
    ],
    featureAudit,
    areaCoverage,
    controlledRainResearch,
    summary: summarizeStage(controlledRainResearch),
  };

  if (options.output) {
    await fs.writeFile(options.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(payload, null, 2));
}

async function readRoutes(filePath: string) {
  const routes = JSON.parse(await fs.readFile(filePath, "utf8")) as ValidationRoute[];
  return routes.map((route) => ({
    ...route,
    area: route.area ?? inferArea(route.id),
  }));
}

async function loadCoveredFeatures(filePath: string) {
  const provider = new StaticCoveredFeatureProvider({
    filePath,
    region: "seattle-stage-8-5-covered-network",
  });
  const result = await provider.getCoveredFeatures({
    west: -122.42,
    south: 47.58,
    east: -122.27,
    north: 47.68,
  });
  return result.features;
}

function auditFeatures(features: CoveredFeature[]) {
  const eligible = features.filter(isRainCoverEligible);
  return {
    totalFeatures: features.length,
    eligibleFeatures: eligible.length,
    restrictedOrIneligibleFeatures: features.length - eligible.length,
    byGeometryType: countBy(features, (featureValue) => featureValue.geometry.type),
    byKind: countBy(features, (featureValue) => featureValue.kind),
    byAccess: countBy(features, (featureValue) => featureValue.access),
    byHighwayTag: countBy(features, (featureValue) => featureValue.tags?.highway ?? "unknown"),
    byCoveredTag: countBy(features, (featureValue) => featureValue.tags?.covered ?? "none"),
    totalEligibleLengthMeters: sumFeatureLength(eligible),
    duplicateGeometryGroups: countDuplicateGeometries(features),
  };
}

async function measureAreaCoverage({
  service,
  features,
  routes,
  routeTimeoutMs,
  routeDelayMs,
}: {
  service: ComfortRouteComparisonService;
  features: CoveredFeature[];
  routes: ValidationRoute[];
  routeTimeoutMs: number;
  routeDelayMs: number;
}) {
  const results: Record<string, unknown> = {};
  for (const area of Object.keys(AREA_BOUNDS) as SeattleValidationArea[]) {
    const areaFeatures = features.filter((featureValue) =>
      geometryIntersectsBbox(featureValue.geometry, AREA_BOUNDS[area]),
    );
    const areaRoutes = routes.filter((route) => route.area === area);
    const fastestRoutes = [];
    for (const route of areaRoutes) {
      try {
        const comparison = await compareWithTimeout(
          service,
          {
            origin: route.origin,
            destination: route.destination,
            departureTime: new Date().toISOString(),
            weatherCoordinate: route.origin,
            generationMode: "osrm-only",
          },
          routeTimeoutMs,
        );
        fastestRoutes.push(comparison.fastest.route.geometry);
      } catch {
        // Area coverage is best-effort because routing providers can time out.
      }
      if (routeDelayMs > 0) await delay(routeDelayMs);
    }
    const metrics = fastestRoutes.map((geometry) =>
      analyzeRouteCoverMetrics(geometry, areaFeatures),
    );
    const totalAnalyzedPedestrianLength = metrics.reduce(
      (sum, metric) => sum + metric.routeMeters,
      0,
    );
    const coveredPedestrianLength = metrics.reduce(
      (sum, metric) => sum + metric.coveredMeters,
      0,
    );
    results[area] = {
      routeCount: areaRoutes.length,
      routedCount: fastestRoutes.length,
      coveredFeatureCount: areaFeatures.length,
      eligibleCoveredFeatureCount: areaFeatures.filter(isRainCoverEligible).length,
      totalMappedCoveredFeatureLengthMeters: sumFeatureLength(areaFeatures),
      totalAnalyzedPedestrianLengthMeters: totalAnalyzedPedestrianLength,
      coveredPedestrianLengthMeters: coveredPedestrianLength,
      coveredPedestrianCoverageRatio:
        totalAnalyzedPedestrianLength > 0
          ? coveredPedestrianLength / totalAnalyzedPedestrianLength
          : 0,
      routeAccessibleCoveredLengthMeters: coveredPedestrianLength,
      longestContinuousCoveredMeters: Math.max(
        0,
        ...metrics.map((metric) => metric.longestContinuousCoveredMeters),
      ),
      coveredSegmentCount: metrics.reduce(
        (sum, metric) => sum + metric.coveredSegmentCount,
        0,
      ),
    };
  }
  return results;
}

async function runControlledSet({
  service,
  routes,
  sample,
  scenario,
  routeTimeoutMs,
  routeDelayMs,
}: {
  service: ComfortRouteComparisonService;
  routes: ValidationRoute[];
  sample: "general" | "cover-rich";
  scenario: (typeof CONTROLLED_RAIN_SCENARIOS)[number];
  routeTimeoutMs: number;
  routeDelayMs: number;
}) {
  const routeResults = [];
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
      routeResults.push({
        id: route.id,
        label: route.label,
        area: route.area,
        sample,
        success: true,
        context: comparison.debug.context?.context,
        rainCapable: comparison.debug.context?.rainCapable,
        fastestEqualsComfort: comparison.fastest.id === comparison.comfort.id,
        extraDurationSeconds: Math.max(
          0,
          comparison.comfort.route.durationSeconds -
            comparison.fastest.route.durationSeconds,
        ),
        fastestCoveredMeters: comparison.fastest.rainAnalysis?.summary.coveredMeters ?? null,
        comfortCoveredMeters: comparison.comfort.rainAnalysis?.summary.coveredMeters ?? null,
        coveredMeterChange:
          (comparison.comfort.rainAnalysis?.summary.coveredMeters ?? 0) -
          (comparison.fastest.rainAnalysis?.summary.coveredMeters ?? 0),
        fastestRainExposure:
          comparison.fastest.rainAnalysis?.summary.averageRainExposure ?? null,
        comfortRainExposure:
          comparison.comfort.rainAnalysis?.summary.averageRainExposure ?? null,
        rainExposureReduction: reductionRatio(
          comparison.fastest.rainAnalysis?.summary.averageRainExposure,
          comparison.comfort.rainAnalysis?.summary.averageRainExposure,
        ),
        rawEnvironmentalCostReduction: reductionRatio(
          comparison.fastest.comfortAnalysis?.routeComfortCost.environmentalExposureCost,
          comparison.comfort.comfortAnalysis?.routeComfortCost.environmentalExposureCost,
        ),
        candidateCoveredRatioRange: numericRange(
          comparison.debug.candidates.flatMap((candidate) =>
            candidate.coveredRatio === null ? [] : [candidate.coveredRatio],
          ),
        ),
        candidateCoveredMetersRange: numericRange(
          comparison.debug.candidates.flatMap((candidate) =>
            candidate.coveredMeters === null ? [] : [candidate.coveredMeters],
          ),
        ),
        maxCandidateCoveredMeters: Math.max(
          0,
          ...comparison.debug.candidates.flatMap((candidate) =>
            candidate.coveredMeters === null ? [] : [candidate.coveredMeters],
          ),
        ),
        maxCandidateLongestCoveredRunMeters: Math.max(
          0,
          ...comparison.debug.candidates.flatMap((candidate) =>
            candidate.longestContinuousCoveredMeters === null
              ? []
              : [candidate.longestContinuousCoveredMeters],
          ),
        ),
        coveredFeatureCount: comparison.debug.coveredFeatures?.loadedFeatures ?? null,
        eligibleCoveredFeatureCount:
          comparison.debug.coveredFeatures?.eligibleFeatures ?? null,
        performanceMs: comparison.debug.performanceMs,
        routingUsage: comparison.debug.routingUsage,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      routeResults.push({
        id: route.id,
        label: route.label,
        area: route.area,
        sample,
        success: false,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
    console.error(`Completed ${sample} ${routeResults.length}/${routes.length}: ${route.id}`);
    if (routeDelayMs > 0) await delay(routeDelayMs);
  }

  return {
    summary: summarizeRoutes(routeResults),
    routes: routeResults,
  };
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
      region: "seattle-stage-8-5-covered-network",
    }),
    "static-osm",
  );
  return { service, routingMetadata };
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

function summarizeRoutes(results: Array<Record<string, unknown>>) {
  const successes = results.filter((result) => result.success === true);
  const different = successes.filter((result) => result.fastestEqualsComfort === false);
  return {
    searches: results.length,
    success: successes.length,
    failures: results.length - successes.length,
    stayDryContexts: successes.filter((result) => result.context === "rain").length,
    rainCapable: successes.filter((result) => result.rainCapable === true).length,
    fastestDiffers: different.length,
    fastestSame: successes.length - different.length,
    averageExtraDurationWhereDifferent:
      averageNumbers(different, "extraDurationSeconds") ?? 0,
    averageCoveredMeterChangeWhereDifferent:
      averageNumbers(different, "coveredMeterChange") ?? 0,
    averageRainExposureReductionWhereDifferent:
      averageNumbers(different, "rainExposureReduction") ?? 0,
    averageRawCostReductionWhereDifferent:
      averageNumbers(different, "rawEnvironmentalCostReduction") ?? 0,
    averageCandidateCoveredMetersRange:
      averageNumbers(successes, "candidateCoveredMetersRange") ?? 0,
    averageCandidateCoveredRatioRange:
      averageNumbers(successes, "candidateCoveredRatioRange") ?? 0,
    averageComfortMs:
      average(
        successes.flatMap((result) => {
          const performanceMs = result.performanceMs as { total?: unknown } | undefined;
          return typeof performanceMs?.total === "number" ? [performanceMs.total] : [];
        }),
      ) ?? null,
    averageManagedRoutingRequests:
      average(
        successes.flatMap((result) => {
          const routingUsage = result.routingUsage as
            | { totalRequests?: unknown }
            | undefined;
          return typeof routingUsage?.totalRequests === "number"
            ? [routingUsage.totalRequests]
            : [];
        }),
      ) ?? null,
  };
}

function summarizeStage(
  scenarios: Array<{
    general: { summary: ReturnType<typeof summarizeRoutes> };
    coverRich: { summary: ReturnType<typeof summarizeRoutes> };
  }>,
) {
  return {
    generalSearches: scenarios.reduce(
      (sum, scenario) => sum + scenario.general.summary.searches,
      0,
    ),
    coverRichSearches: scenarios.reduce(
      (sum, scenario) => sum + scenario.coverRich.summary.searches,
      0,
    ),
    generalFastestDiffers: scenarios.reduce(
      (sum, scenario) => sum + scenario.general.summary.fastestDiffers,
      0,
    ),
    coverRichFastestDiffers: scenarios.reduce(
      (sum, scenario) => sum + scenario.coverRich.summary.fastestDiffers,
      0,
    ),
  };
}

function sumFeatureLength(features: CoveredFeature[]) {
  return features.reduce((sum, featureValue) => {
    if (featureValue.geometry.type === "LineString") {
      return sum + routeLengthMeters(featureValue.geometry);
    }
    return sum + routeLengthMeters({
      type: "LineString",
      coordinates: featureValue.geometry.coordinates[0] ?? [],
    });
  }, 0);
}

function geometryIntersectsBbox(
  geometry: LineString | Polygon,
  [west, south, east, north]: [number, number, number, number],
) {
  const coordinates =
    geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates.flat();
  return coordinates.some(
    ([longitude, latitude]) =>
      longitude >= west && longitude <= east && latitude >= south && latitude <= north,
  );
}

function countBy<T>(values: T[], selector: (value: T) => string) {
  return values.reduce<Record<string, number>>((counts, value) => {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function countDuplicateGeometries(features: CoveredFeature[]) {
  const counts = countBy(features, (featureValue) =>
    JSON.stringify(featureValue.geometry.coordinates),
  );
  return Object.values(counts).filter((count) => count > 1).length;
}

function reductionRatio(before: number | null | undefined, after: number | null | undefined) {
  if (typeof before !== "number" || typeof after !== "number" || before <= 0) return 0;
  return Math.max(0, (before - after) / before);
}

function numericRange(values: number[]) {
  if (values.length < 2) return 0;
  return Math.max(...values) - Math.min(...values);
}

function averageNumbers(values: Array<Record<string, unknown>>, key: string) {
  return average(values.flatMap((value) => (typeof value[key] === "number" ? [value[key]] : [])));
}

function average(values: unknown[]) {
  const numbers = values.filter((value): value is number => typeof value === "number");
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function inferArea(id: string): SeattleValidationArea {
  if (id.includes("belltown") || id.includes("seattle-center") || id.includes("olympic")) {
    return "Belltown";
  }
  if (id.includes("slu") || id.includes("lake-union")) return "South Lake Union";
  if (id.includes("capitol") || id.includes("cal-anderson")) return "Capitol Hill";
  if (id.includes("uw") || id.includes("udistrict")) return "University District";
  if (id.includes("waterfront") || id.includes("ferry")) return "Waterfront";
  return "Downtown";
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
