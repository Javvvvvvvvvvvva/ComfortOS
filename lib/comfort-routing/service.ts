import { ComfortAnalysisService } from "@/lib/comfort/service";
import type { ComfortAnalysisResult } from "@/lib/comfort/types";
import { boundsForLineString } from "@/lib/environment/buildings/bounds";
import type {
  BoundingBox,
  Building,
  BuildingProvider,
} from "@/lib/environment/buildings/types";
import type { ShadeAnalysisService } from "@/lib/environment/shade/service";
import type { ShadeAnalysisResult } from "@/lib/environment/shade/types";
import type { WindAnalysisResult } from "@/lib/environment/wind/types";
import type { WindAnalysisService } from "@/lib/environment/wind/windService";
import type { Coordinate } from "@/lib/geo/types";
import {
  calculateCandidateDiversity,
  deduplicateRouteCandidates,
} from "@/lib/routing/candidates";
import type {
  CandidateGenerationPolicy,
  CandidateGenerator,
} from "@/lib/routing/generators/types";
import { DEFAULT_CANDIDATE_GENERATION_POLICY } from "@/lib/routing/generators/types";
import { RoutingService } from "@/lib/routing/service";
import type { RouteCandidate, RouteRequest, RouteResult } from "@/lib/routing/types";
import type { WeatherService } from "@/lib/weather/service";
import type { WeatherBundle } from "@/lib/weather/types";
import type { ComfortRouteRerankingPolicy } from "@/lib/comfort-routing/policy";
import { DEFAULT_COMFORT_ROUTE_RERANKING_POLICY } from "@/lib/comfort-routing/policy";
import { selectComfortRouteComparison } from "@/lib/comfort-routing/selector";
import type {
  AnalyzedRouteCandidate,
  ComfortRouteComparisonDebug,
  ComfortRouteComparisonResult,
} from "@/lib/comfort-routing/types";

export type ComfortRouteComparisonRequest = RouteRequest & {
  weatherCoordinate?: Coordinate;
  weatherBundle?: WeatherBundle;
  policy?: Partial<ComfortRouteRerankingPolicy>;
  generationPolicy?: Partial<CandidateGenerationPolicy>;
  generationMode?: "osrm-only" | "enhanced";
  includeEnvironmentalDebug?: boolean;
};

type CandidateTiming = {
  shadeAnalysis: number;
  windAnalysis: number;
  comfortAnalysis: number;
};

export class ComfortRouteComparisonService {
  constructor(
    private readonly routingService: RoutingService,
    private readonly candidateGenerator: CandidateGenerator,
    private readonly weatherService: WeatherService,
    private readonly buildingProvider: BuildingProvider,
    private readonly shadeService: ShadeAnalysisService,
    private readonly windService: WindAnalysisService,
    private readonly comfortService = new ComfortAnalysisService(),
    private readonly buildingProviderMode = "unknown",
  ) {}

  async compareWalkingRoutes(
    request: ComfortRouteComparisonRequest,
  ): Promise<ComfortRouteComparisonResult> {
    const startedAt = performance.now();
    const generationPolicy = {
      ...DEFAULT_CANDIDATE_GENERATION_POLICY,
      ...request.generationPolicy,
    };

    const routingStartedAt = performance.now();
    const fastestRoute = await this.routingService.getFastestWalkingRoute(request);
    const candidateSet = await this.candidateGenerator.generateCandidates(request, {
      fastestRoute,
      policy: generationPolicy,
    });
    const routingCandidates = performance.now() - routingStartedAt;
    const generatedCandidates = ensureFastestCandidate(candidateSet.candidates, fastestRoute);
    const deduplicated = deduplicateRouteCandidates(generatedCandidates);
    const prefiltered = prefilterCandidates(deduplicated, fastestRoute, generationPolicy);
    const candidates = prefiltered.accepted.slice(
      0,
      generationPolicy.maxEnvironmentAnalyzedCandidates,
    );

    const weatherStartedAt = performance.now();
    const weatherBundle =
      request.weatherBundle ??
      (await this.weatherService.getWeatherBundle(request.weatherCoordinate ?? request.origin));
    const weather = performance.now() - weatherStartedAt;

    const buildingStartedAt = performance.now();
    const sharedBuildings = await this.getSharedBuildings(candidates);
    const buildingFetch = performance.now() - buildingStartedAt;

    const timing: CandidateTiming = {
      shadeAnalysis: 0,
      windAnalysis: 0,
      comfortAnalysis: 0,
    };
    const candidateAnalysisStartedAt = performance.now();
    const analyzed = await Promise.all(
      candidates.map((candidate) =>
        this.analyzeCandidate({
          candidate,
          departureTime: request.departureTime,
          weatherBundle,
          weatherCoordinate: request.weatherCoordinate ?? request.origin,
          includeEnvironmentalDebug: request.includeEnvironmentalDebug ?? false,
          buildings: sharedBuildings,
          timing,
        }),
      ),
    );
    const candidateAnalysis = performance.now() - candidateAnalysisStartedAt;

    const rerankingStartedAt = performance.now();
    const comparison = selectComfortRouteComparison({
      candidates: analyzed,
      policy: {
        ...DEFAULT_COMFORT_ROUTE_RERANKING_POLICY,
        ...request.policy,
      },
      provider: candidateSet.provider ?? fastestRoute.provider,
      generation: {
        mode: request.generationMode ?? "enhanced",
        generatedCandidates: generatedCandidates.length,
        deduplicatedCandidates: deduplicated.length,
        detourFilteredCandidates: prefiltered.detourFilteredCandidates,
        diversityFilteredCandidates: prefiltered.diversityFilteredCandidates,
        environmentAnalyzedCandidates: candidates.length,
        rejectedCandidates: prefiltered.rejectedCandidates,
        diversity: buildDiversitySummary(analyzed),
      },
      buildings: buildBuildingDebug(this.buildingProviderMode, sharedBuildings),
      performanceMs: {
        routingCandidates: Math.round(routingCandidates),
        buildingFetch: Math.round(buildingFetch),
        weather: Math.round(weather),
        shadeAnalysis: Math.round(timing.shadeAnalysis),
        windAnalysis: Math.round(timing.windAnalysis),
        comfortAnalysis: Math.round(timing.comfortAnalysis),
        candidateAnalysis: Math.round(candidateAnalysis),
        reranking: 0,
        total: 0,
      },
    });
    const reranking = performance.now() - rerankingStartedAt;

    comparison.debug.performanceMs = {
      routingCandidates: Math.round(routingCandidates),
      buildingFetch: Math.round(buildingFetch),
      weather: Math.round(weather),
      shadeAnalysis: Math.round(timing.shadeAnalysis),
      windAnalysis: Math.round(timing.windAnalysis),
      comfortAnalysis: Math.round(timing.comfortAnalysis),
      candidateAnalysis: Math.round(candidateAnalysis),
      reranking: Math.round(reranking),
      total: Math.round(performance.now() - startedAt),
    };

    return comparison;
  }

  private async analyzeCandidate({
    candidate,
    departureTime,
    weatherBundle,
    weatherCoordinate,
    includeEnvironmentalDebug,
    buildings,
    timing,
  }: {
    candidate: RouteCandidate & { routeOverlapRatio: number };
    departureTime: string;
    weatherBundle: WeatherBundle;
    weatherCoordinate: Coordinate;
    includeEnvironmentalDebug: boolean;
    buildings: Building[] | null;
    timing: CandidateTiming;
  }): Promise<Omit<AnalyzedRouteCandidate, "role" | "metrics">> {
    const shadeAnalysisTask = buildings
      ? timeAsync(timing, "shadeAnalysis", () =>
          this.shadeService.analyzeRouteShade({ route: candidate, departureTime, buildings }),
        )
      : Promise.resolve(null);
    const windAnalysisTask = buildings
      ? timeAsync(timing, "windAnalysis", () =>
          this.windService.analyzeRouteWind({
            route: candidate,
            departureTime,
            weatherCoordinate,
            weatherBundle,
            buildings,
          }),
        )
      : Promise.resolve(null);
    const [shadeResult, windResult] = await Promise.allSettled([
      shadeAnalysisTask,
      windAnalysisTask,
    ]);
    const shadeAnalysis = resultValue<ShadeAnalysisResult | null>(shadeResult);
    const windAnalysis = resultValue<WindAnalysisResult | null>(windResult);
    const comfortAnalysis = await timeAsync(timing, "comfortAnalysis", () =>
      this.analyzeComfort({
        candidate,
        departureTime,
        weatherBundle,
        shadeAnalysis,
        windAnalysis,
      }),
    );

    return {
      id: candidate.id,
      route: candidate,
      status: comfortAnalysis?.routeComfortCost.comparable ? "complete" : "partial",
      routeOverlapRatio: candidate.routeOverlapRatio,
      shadeAnalysis: includeEnvironmentalDebug ? shadeAnalysis : stripShadeDebug(shadeAnalysis),
      windAnalysis: includeEnvironmentalDebug ? windAnalysis : stripWindDebug(windAnalysis),
      comfortAnalysis: includeEnvironmentalDebug
        ? comfortAnalysis
        : stripComfortDebug(comfortAnalysis),
      error:
        !shadeAnalysis || !windAnalysis || !comfortAnalysis
          ? "One or more environmental analyses were unavailable for this candidate."
          : undefined,
    };
  }

  private async analyzeComfort({
    candidate,
    departureTime,
    weatherBundle,
    shadeAnalysis,
    windAnalysis,
  }: {
    candidate: RouteCandidate;
    departureTime: string;
    weatherBundle: WeatherBundle;
    shadeAnalysis: ShadeAnalysisResult | null;
    windAnalysis: WindAnalysisResult | null;
  }): Promise<ComfortAnalysisResult | null> {
    try {
      return await this.comfortService.analyzeRouteComfort({
        route: candidate,
        departureTime,
        weatherBundle,
        shadeAnalysis,
        windAnalysis,
        profile: "cold",
      });
    } catch {
      return null;
    }
  }

  private async getSharedBuildings(candidates: RouteCandidate[]): Promise<Building[] | null> {
    if (candidates.length === 0) return [];
    try {
      return await this.buildingProvider.getBuildings(unionRouteBounds(candidates));
    } catch {
      return null;
    }
  }
}

function resultValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function stripShadeDebug(analysis: ShadeAnalysisResult | null) {
  if (!analysis?.debug) return analysis;
  return { ...analysis, debug: undefined };
}

function stripWindDebug(analysis: WindAnalysisResult | null) {
  if (!analysis?.debug) return analysis;
  return { ...analysis, debug: undefined };
}

function stripComfortDebug(analysis: ComfortAnalysisResult | null) {
  if (!analysis?.debug) return analysis;
  return { ...analysis, debug: undefined };
}

function ensureFastestCandidate(
  candidates: RouteCandidate[],
  fastestRoute: RouteResult,
): RouteCandidate[] {
  const hasFastest = candidates.some((candidate) => isSameRoute(candidate, fastestRoute));
  if (hasFastest) return candidates;

  return [
    {
      ...fastestRoute,
      id: "fastest",
      sourceRouteIndex: -1,
      generation: { generator: "fallback" },
    },
    ...candidates,
  ];
}

function prefilterCandidates(
  candidates: Array<RouteCandidate & { routeOverlapRatio: number }>,
  fastestRoute: RouteResult,
  policy: CandidateGenerationPolicy,
) {
  const accepted: Array<RouteCandidate & { routeOverlapRatio: number }> = [];
  const rejectedCandidates: NonNullable<
    ComfortRouteComparisonDebug["generation"]
  >["rejectedCandidates"] = [];
  let detourFilteredCandidates = 0;
  let diversityFilteredCandidates = 0;

  for (const candidate of candidates) {
    const isFastest = isSameRoute(candidate, fastestRoute);
    const generator = candidate.generation?.generator ?? "unknown";
    const durationRatio =
      fastestRoute.durationSeconds > 0
        ? (candidate.durationSeconds - fastestRoute.durationSeconds) / fastestRoute.durationSeconds
        : 0;
    const distanceRatio =
      fastestRoute.distanceMeters > 0
        ? (candidate.distanceMeters - fastestRoute.distanceMeters) / fastestRoute.distanceMeters
        : 0;

    if (
      !isFastest &&
      (durationRatio > policy.maxPreAnalysisDurationRatio ||
        distanceRatio > policy.maxPreAnalysisDistanceRatio)
    ) {
      detourFilteredCandidates += 1;
      rejectedCandidates.push({ id: candidate.id, generator, reason: "excessive-detour" });
      continue;
    }

    const diversity = calculateCandidateDiversity(candidate, fastestRoute);
    if (!isFastest && diversity.uniqueMeters < policy.minUniqueMeters) {
      diversityFilteredCandidates += 1;
      rejectedCandidates.push({ id: candidate.id, generator, reason: "low-diversity" });
      continue;
    }

    accepted.push(candidate);
  }

  return {
    accepted,
    detourFilteredCandidates,
    diversityFilteredCandidates,
    rejectedCandidates,
  };
}

function isSameRoute(candidate: Pick<RouteCandidate, "durationSeconds" | "distanceMeters">, route: RouteResult) {
  return (
    Math.abs(candidate.durationSeconds - route.durationSeconds) < 1 &&
    Math.abs(candidate.distanceMeters - route.distanceMeters) < 1
  );
}

function unionRouteBounds(candidates: RouteCandidate[]): BoundingBox {
  const [first, ...rest] = candidates.map((candidate) =>
    boundsForLineString(candidate.geometry),
  );

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

function buildDiversitySummary(
  candidates: Array<Omit<AnalyzedRouteCandidate, "role" | "metrics">>,
) {
  const costs = candidates.flatMap((candidate) => {
    const cost = candidate.comfortAnalysis?.routeComfortCost;
    return cost?.comparable ? [cost.environmentalExposureCost] : [];
  });
  const winds = candidates.flatMap((candidate) =>
    candidate.windAnalysis ? [candidate.windAnalysis.summary.averageEstimatedExposureMps] : [],
  );
  const shades = candidates.flatMap((candidate) =>
    candidate.shadeAnalysis ? [candidate.shadeAnalysis.summary.shadeRatio] : [],
  );
  const overlaps = candidates.map((candidate) => candidate.routeOverlapRatio);

  return {
    rawEnvironmentalCostRange: numericRange(costs),
    windExposureRange: numericRange(winds),
    shadeRatioRange: numericRange(shades),
    routeOverlapRange: numericRange(overlaps),
  };
}

function buildBuildingDebug(providerMode: string, buildings: Building[] | null) {
  return {
    providerMode,
    loadedBuildings: buildings?.length ?? 0,
    explicitHeightBuildings:
      buildings?.filter((building) => building.heightSource === "provider").length ?? 0,
    floorDerivedHeightBuildings:
      buildings?.filter((building) => building.heightSource === "floors-derived").length ?? 0,
    unknownHeightBuildings:
      buildings?.filter((building) => building.heightSource === "unknown").length ?? 0,
    querySucceeded: buildings !== null,
  };
}

function numericRange(values: number[]) {
  if (values.length < 2) return null;
  return Math.max(...values) - Math.min(...values);
}

async function timeAsync<T>(
  timing: CandidateTiming,
  key: keyof CandidateTiming,
  callback: () => Promise<T>,
) {
  const startedAt = performance.now();
  try {
    return await callback();
  } finally {
    timing[key] += performance.now() - startedAt;
  }
}
