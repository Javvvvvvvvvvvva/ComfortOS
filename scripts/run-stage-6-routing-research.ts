import fs from "node:fs/promises";
import { calculateCandidateDiversity } from "@/lib/routing/candidates";
import { ComfortRouteComparisonService } from "@/lib/comfort-routing/service";
import { createConfiguredBuildingProvider } from "@/lib/environment/buildings/providers/configuredBuildingProvider";
import { boundsForLineString } from "@/lib/environment/buildings/bounds";
import { ShadeAnalysisService } from "@/lib/environment/shade/service";
import { WindAnalysisService } from "@/lib/environment/wind/windService";
import type { LineStringGeometry } from "@/lib/geo/types";
import { buildResearchGraphFromRoutes, nearestGraphNode } from "@/lib/routing-research/graph/buildGraph";
import { EdgeEnvironmentCache } from "@/lib/routing-research/cost/edgeEnvironment";
import { MINNEAPOLIS_WINTER_SCENARIOS, scenarioToWeatherBundle } from "@/lib/routing-research/environment/scenarios";
import { searchResearchRoute } from "@/lib/routing-research/search/dijkstra";
import { CompositeCandidateGenerator } from "@/lib/routing/generators/compositeCandidateGenerator";
import { CorridorWaypointGenerator } from "@/lib/routing/generators/corridorWaypointGenerator";
import { OsrmAlternativeGenerator } from "@/lib/routing/generators/osrmAlternativeGenerator";
import { OsrmWalkingProvider } from "@/lib/routing/providers/osrmWalkingProvider";
import { RoutingService } from "@/lib/routing/service";
import type { RouteCandidate, RouteResult } from "@/lib/routing/types";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";
import routes from "@/fixtures/routes/minneapolis-stage-5-5-routes.json";

type ResearchRow = {
  routeId: string;
  scenarioId: string;
  graphNodes: number;
  graphEdges: number;
  stage5ComfortDiffers: boolean;
  stage6ComfortDiffers: boolean;
  fastestDurationSeconds: number;
  stage6DurationSeconds: number | null;
  extraDurationSeconds: number | null;
  environmentalCostReductionRatio: number | null;
  windExposureReductionMps: number | null;
  shadeRatioChange: number | null;
  routeOverlapWithFastest: number | null;
  cacheHits: number;
  cacheMisses: number;
  fastestSearchMs: number;
  comfortSearchMs: number;
  totalMs: number;
  selectedLambda: number;
  boundedDetourDifferent: boolean;
};

type ResearchError = {
  routeId: string;
  attempts: number;
  error: string;
};

const DEFAULT_OUTPUT = "/tmp/comfortos-stage-6-routing-research.json";
const LAMBDAS = [0, 0.25, 0.5, 1, 2];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const routeLimit = options.limit ? Number(options.limit) : routes.length;
  if (options.localStore) {
    process.env.BUILDING_PROVIDER = "local-overture";
    process.env.BUILDING_LOCAL_OVERTURE_STORE_DIR = options.localStore;
  }
  const { provider: buildingProvider } = createConfiguredBuildingProvider();
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
    "stage-6-research",
  );

  const scenarios = [
    ...(options.includeLive === "true" ? ["LIVE_NWS"] : []),
    ...MINNEAPOLIS_WINTER_SCENARIOS.filter((scenario) => scenario.id !== "WINTER_NIGHT").map((scenario) => scenario.id),
  ];
  const rows: ResearchRow[] = [];
  const errors: ResearchError[] = [];

  for (const route of routes.slice(0, routeLimit)) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        console.error(`[stage6] ${route.id}: attempt ${attempt}`);
        const routeRows: ResearchRow[] = [];
        const fastest = await routingService.getFastestWalkingRoute({
          origin: route.origin,
          destination: route.destination,
          departureTime: new Date().toISOString(),
        });
        const comparison = await comparisonService.compareWalkingRoutes({
          origin: route.origin,
          destination: route.destination,
          departureTime: new Date().toISOString(),
          generationMode: "enhanced",
          generationPolicy: {
            maxEnvironmentAnalyzedCandidates: 5,
            maxCandidateAttempts: 8,
          },
        });
        const graphRoutes = [toCandidate("osrm-fastest", fastest), ...comparison.candidates.map((candidate) => candidate.route)];
        const graph = buildResearchGraphFromRoutes({ id: `stage-6-${route.id}`, routes: graphRoutes });
        const originNode = nearestGraphNode(graph, route.origin);
        const destinationNode = nearestGraphNode(graph, route.destination);
        const buildings = await buildingProvider.getBuildings(boundsForRoutes(graphRoutes.map((value) => value.geometry)));

        for (const scenarioId of scenarios) {
          const startedAt = performance.now();
          const scenario = MINNEAPOLIS_WINTER_SCENARIOS.find((value) => value.id === scenarioId);
          const departureTime = scenario?.timestamp ?? new Date().toISOString();
          const weatherBundle = scenario
            ? scenarioToWeatherBundle(scenario, route.origin)
            : await weatherService.getWeatherBundle(route.origin);
          const cache = new EdgeEnvironmentCache(buildings, weatherBundle, scenarioId);

          const fastestStartedAt = performance.now();
          const graphFastest = await searchResearchRoute({
            graph,
            originNodeId: originNode.id,
            destinationNodeId: destinationNode.id,
            mode: { type: "fastest" },
            departureTime,
            environmentCache: cache,
          });
          const fastestSearchMs = Math.round(performance.now() - fastestStartedAt);
          if (!graphFastest) continue;

          const lambdaResults = [];
          for (const lambda of LAMBDAS) {
            const comfortStartedAt = performance.now();
            const result = await searchResearchRoute({
              graph,
              originNodeId: originNode.id,
              destinationNodeId: destinationNode.id,
              mode: { type: "lambda", lambda },
              departureTime,
              environmentCache: cache,
            });
            lambdaResults.push({
              lambda,
              result,
              searchMs: Math.round(performance.now() - comfortStartedAt),
            });
          }
          const bounded = await searchResearchRoute({
            graph,
            originNodeId: originNode.id,
            destinationNodeId: destinationNode.id,
            mode: {
              type: "bounded-environment",
              maxExtraDurationRatio: 0.25,
              maxExtraDurationSeconds: 240,
            },
            departureTime,
            environmentCache: cache,
            fastestDurationSeconds: graphFastest.durationSeconds,
          });
          const selected = chooseLambdaResult(lambdaResults);
          const stage6Route = selected.result;
          routeRows.push({
            routeId: route.id,
            scenarioId,
            graphNodes: graph.nodes.size,
            graphEdges: graph.edges.size,
            stage5ComfortDiffers: comparison.fastest.id !== comparison.comfort.id,
            stage6ComfortDiffers: Boolean(stage6Route && !sameEdgePath(stage6Route.edges, graphFastest.edges)),
            fastestDurationSeconds: graphFastest.durationSeconds,
            stage6DurationSeconds: stage6Route?.durationSeconds ?? null,
            extraDurationSeconds: stage6Route ? stage6Route.durationSeconds - graphFastest.durationSeconds : null,
            environmentalCostReductionRatio: stage6Route
              ? reduction(graphFastest.environmentalExposureCost, stage6Route.environmentalExposureCost)
              : null,
            windExposureReductionMps: stage6Route
              ? graphFastest.averageWindExposureMps - stage6Route.averageWindExposureMps
              : null,
            shadeRatioChange: stage6Route
              ? stage6Route.averageShadeRatio - graphFastest.averageShadeRatio
              : null,
            routeOverlapWithFastest: stage6Route
              ? calculateCandidateDiversity(toRouteCandidate("stage6", routeFromResearch(stage6Route)), routeFromResearch(graphFastest))
                  .overlapWithFastest
              : null,
            cacheHits: cache.hits,
            cacheMisses: cache.misses,
            fastestSearchMs,
            comfortSearchMs: selected.searchMs,
            totalMs: Math.round(performance.now() - startedAt),
            selectedLambda: selected.lambda,
            boundedDetourDifferent: Boolean(bounded && !sameEdgePath(bounded.edges, graphFastest.edges)),
          });
        }
        rows.push(...routeRows);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        console.error(`[stage6] ${route.id}: attempt ${attempt} failed: ${formatError(error)}`);
        if (attempt < 3) await delay(2_000 * attempt);
      }
    }
    if (lastError) {
      errors.push({ routeId: route.id, attempts: 3, error: formatError(lastError) });
    }
  }

  const report = {
    createdAt: new Date().toISOString(),
    routeCount: routeLimit,
    scenarios,
    lambdaValues: LAMBDAS,
    summary: summarize(rows),
    errors,
    rows,
  };
  const output = options.output ?? DEFAULT_OUTPUT;
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

function chooseLambdaResult(
  results: Array<{ lambda: number; result: Awaited<ReturnType<typeof searchResearchRoute>>; searchMs: number }>,
) {
  return (
    results.find((item) => item.lambda === 1 && item.result) ??
    results.find((item) => item.result && item.lambda > 0) ??
    results[0]
  );
}

function summarize(rows: ResearchRow[]) {
  const byScenario = Object.fromEntries(
    Array.from(new Set(rows.map((row) => row.scenarioId))).map((scenarioId) => {
      const scenarioRows = rows.filter((row) => row.scenarioId === scenarioId);
      return [
        scenarioId,
        {
          searches: scenarioRows.length,
          stage5Differs: scenarioRows.filter((row) => row.stage5ComfortDiffers).length,
          stage6Differs: scenarioRows.filter((row) => row.stage6ComfortDiffers).length,
          averageExtraDurationSeconds: average(scenarioRows.flatMap((row) => row.extraDurationSeconds ?? [])),
          averageEnvironmentalReduction: average(scenarioRows.flatMap((row) => row.environmentalCostReductionRatio ?? [])),
          averageWindReductionMps: average(scenarioRows.flatMap((row) => row.windExposureReductionMps ?? [])),
          averageShadeRatioChange: average(scenarioRows.flatMap((row) => row.shadeRatioChange ?? [])),
          averageCacheHitRate: average(
            scenarioRows.map((row) =>
              row.cacheHits + row.cacheMisses > 0 ? row.cacheHits / (row.cacheHits + row.cacheMisses) : 0,
            ),
          ),
          averageTotalMs: average(scenarioRows.map((row) => row.totalMs)),
        },
      ];
    }),
  );
  return { byScenario };
}

function boundsForRoutes(geometries: LineStringGeometry[]) {
  const [first, ...rest] = geometries.map((geometry) => boundsForLineString(geometry));
  return rest.reduce(
    (current, bounds) => ({
      west: Math.min(current.west, bounds.west),
      south: Math.min(current.south, bounds.south),
      east: Math.max(current.east, bounds.east),
      north: Math.max(current.north, bounds.north),
    }),
    first,
  );
}

function routeFromResearch(route: { edges: Array<{ geometry: LineStringGeometry; durationSeconds: number; distanceMeters: number }> }): RouteResult {
  const coordinates = route.edges.flatMap((edge, index) =>
    index === 0 ? edge.geometry.coordinates : edge.geometry.coordinates.slice(1),
  );
  return {
    geometry: { type: "LineString", coordinates },
    durationSeconds: route.edges.reduce((sum, edge) => sum + edge.durationSeconds, 0),
    distanceMeters: route.edges.reduce((sum, edge) => sum + edge.distanceMeters, 0),
  };
}

function toCandidate(id: string, route: RouteResult): RouteCandidate {
  return { ...route, id, sourceRouteIndex: 0, generation: { generator: "fallback" } };
}

function toRouteCandidate(id: string, route: RouteResult): RouteCandidate {
  return { ...route, id, sourceRouteIndex: 0, generation: { generator: "fallback" } };
}

function sameEdgePath(left: Array<{ id: string }>, right: Array<{ id: string }>) {
  return left.map((edge) => edge.id).join("|") === right.map((edge) => edge.id).join("|");
}

function reduction(base: number, candidate: number) {
  return base > 0 ? (base - candidate) / base : 0;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
