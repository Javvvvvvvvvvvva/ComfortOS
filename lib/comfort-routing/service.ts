import { ComfortAnalysisService } from "@/lib/comfort/service";
import type { ComfortAnalysisResult } from "@/lib/comfort/types";
import { boundsCenter, boundsForLineString } from "@/lib/environment/buildings/bounds";
import type {
  BoundingBox,
  Building,
  BuildingProviderMetadata,
  BuildingProvider,
} from "@/lib/environment/buildings/types";
import type {
  CoveredFeature,
  CoveredFeatureProvider,
  CoveredFeatureProviderMetadata,
} from "@/lib/environment/coveredFeatures/types";
import { isRainCoverEligible } from "@/lib/environment/coveredFeatures/semantics";
import { RainAnalysisService } from "@/lib/environment/rain/rainExposureEngine";
import type { RainAnalysisResult } from "@/lib/environment/rain/types";
import { HeatAnalysisService } from "@/lib/environment/heat/heatExposureEngine";
import type { HeatAnalysisResult } from "@/lib/environment/heat/types";
import type { ShadeAnalysisService } from "@/lib/environment/shade/service";
import { prepareShadowBuildingContext } from "@/lib/environment/shade/shadowEngine";
import type { ShadeAnalysisResult } from "@/lib/environment/shade/types";
import type { WindAnalysisResult } from "@/lib/environment/wind/types";
import type { WindAnalysisService } from "@/lib/environment/wind/windService";
import { prepareWindBuildingContext } from "@/lib/environment/wind/urbanWindModel";
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
import {
  createRoutingUsageMetrics,
  type RouteCandidate,
  type RouteRequest,
  type RouteResult,
} from "@/lib/routing/types";
import type { WeatherService } from "@/lib/weather/service";
import type { WeatherBundle } from "@/lib/weather/types";
import { deriveRegionCapabilities } from "@/lib/regions/capabilities";
import type { ComfortRouteRerankingPolicy } from "@/lib/comfort-routing/policy";
import { DEFAULT_COMFORT_ROUTE_RERANKING_POLICY } from "@/lib/comfort-routing/policy";
import {
  decideRoutingContext,
  type RoutingContext,
} from "@/lib/comfort-routing/contextualMode";
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
  generationMode?: "provider-only" | "osrm-only" | "enhanced";
  includeEnvironmentalDebug?: boolean;
};

export type ComfortRouteComparisonOptions = {
  signal?: AbortSignal;
};

type CandidateTiming = {
  shadeAnalysis: number;
  windAnalysis: number;
  rainAnalysis: number;
  heatAnalysis: number;
  comfortAnalysis: number;
};

type CandidatePreComfortAnalysis = {
  candidate: RouteCandidate & { routeOverlapRatio: number };
  shadeAnalysis: ShadeAnalysisResult | null;
  windAnalysis: WindAnalysisResult | null;
  rainAnalysis: RainAnalysisResult | null;
  heatAnalysis: HeatAnalysisResult | null;
  includeEnvironmentalDebug: boolean;
  error?: string;
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
    private readonly coveredFeatureProvider?: CoveredFeatureProvider,
    private readonly coveredFeatureProviderMode = "disabled",
    private readonly rainService = new RainAnalysisService(),
    private readonly heatService = new HeatAnalysisService(),
  ) {}

  async compareWalkingRoutes(
    request: ComfortRouteComparisonRequest,
    options: ComfortRouteComparisonOptions = {},
  ): Promise<ComfortRouteComparisonResult> {
    const startedAt = performance.now();
    const performanceMs: NonNullable<ComfortRouteComparisonDebug["performanceMs"]> = {
      routingCandidates: 0,
      weather: 0,
      candidateAnalysis: 0,
      reranking: 0,
      total: 0,
    };
    const recordStage = (stage: string, durationMs: number) => {
      const rounded = Math.round(durationMs);
      if (stage === "candidateGeneration.provider-alternative") {
        performanceMs.providerAlternatives = rounded;
      } else if (stage === "candidateGeneration.corridor-waypoint") {
        performanceMs.corridorCandidates = rounded;
      }
    };
    const generationPolicy = {
      ...DEFAULT_CANDIDATE_GENERATION_POLICY,
      ...request.generationPolicy,
    };
    const routingUsage = createRoutingUsageMetrics();

    const fastestRouteStartedAt = performance.now();
    const fastestRoute = await this.routingService.getFastestWalkingRoute(request, {
      signal: options.signal,
      usageCategory: "fastest",
      usageMetrics: routingUsage,
    });
    performanceMs.fastestRoute = Math.round(performance.now() - fastestRouteStartedAt);
    const routingProviderMetadata = await this.routingService.getProviderMetadata();

    throwIfAborted(options.signal);
    const candidateGenerationStartedAt = performance.now();
    const candidateSet = await this.candidateGenerator.generateCandidates(request, {
      fastestRoute,
      policy: generationPolicy,
      signal: options.signal,
      usageMetrics: routingUsage,
      diagnostics: { recordStage },
    });
    const candidateGeneration = performance.now() - candidateGenerationStartedAt;
    performanceMs.candidateGeneration = Math.round(candidateGeneration);
    performanceMs.routingCandidates = performanceMs.candidateGeneration;

    throwIfAborted(options.signal);
    const normalizationStartedAt = performance.now();
    const generatedCandidates = ensureFastestCandidate(candidateSet.candidates, fastestRoute);
    performanceMs.candidateNormalization = Math.round(
      performance.now() - normalizationStartedAt,
    );
    const dedupeStartedAt = performance.now();
    const deduplicated = deduplicateRouteCandidates(generatedCandidates);
    performanceMs.candidateDedupe = Math.round(performance.now() - dedupeStartedAt);
    const prefilterStartedAt = performance.now();
    const prefiltered = prefilterCandidates(deduplicated, fastestRoute, generationPolicy);
    performanceMs.detourFiltering = Math.round(prefiltered.detourFilteringMs);
    performanceMs.diversityFiltering = Math.round(
      Math.max(0, performance.now() - prefilterStartedAt - prefiltered.detourFilteringMs),
    );
    const candidates = prefiltered.accepted.slice(
      0,
      generationPolicy.maxEnvironmentAnalyzedCandidates,
    );

    throwIfAborted(options.signal);
    const weatherStartedAt = performance.now();
    const weatherBundle =
      request.weatherBundle ??
      (await this.weatherService.getWeatherBundle(request.weatherCoordinate ?? request.origin));
    performanceMs.weather = Math.round(performance.now() - weatherStartedAt);

    throwIfAborted(options.signal);
    const buildingStartedAt = performance.now();
    const sharedBuildings = await this.getSharedBuildings(candidates, options.signal);
    performanceMs.buildingFetch = Math.round(performance.now() - buildingStartedAt);
    const sharedProjectionOrigin = boundsCenter(unionRouteBounds(candidates));
    const preparedShadowBuildingContext = sharedBuildings
      ? prepareShadowBuildingContext(sharedBuildings, sharedProjectionOrigin)
      : undefined;
    const preparedWindBuildingContext = sharedBuildings
      ? prepareWindBuildingContext(sharedBuildings, sharedProjectionOrigin)
      : undefined;
    const buildingMetadataStartedAt = performance.now();
    const buildingMetadata = await this.getBuildingMetadata();
    performanceMs.buildingMetadata = Math.round(performance.now() - buildingMetadataStartedAt);
    const coveredFeatureStartedAt = performance.now();
    const coveredFeatureResult = await this.getSharedCoveredFeatures(
      candidates,
      options.signal,
    );
    performanceMs.coveredFeatureFetch = Math.round(
      performance.now() - coveredFeatureStartedAt,
    );

    const timing: CandidateTiming = {
      shadeAnalysis: 0,
      windAnalysis: 0,
      rainAnalysis: 0,
      heatAnalysis: 0,
      comfortAnalysis: 0,
    };
    throwIfAborted(options.signal);
    const candidateAnalysisStartedAt = performance.now();
    const environmentalAnalyses = await Promise.all(
      candidates.map((candidate) =>
        this.analyzeCandidateEnvironment({
          candidate,
          departureTime: request.departureTime,
          weatherBundle,
          weatherCoordinate: request.weatherCoordinate ?? request.origin,
          includeEnvironmentalDebug: request.includeEnvironmentalDebug ?? false,
          buildings: sharedBuildings,
          projectionOrigin: sharedProjectionOrigin,
          preparedShadowBuildingContext,
          preparedWindBuildingContext,
          coveredFeatures: coveredFeatureResult.features,
          timing,
          signal: options.signal,
        }),
      ),
    );
    const rainCapability = calculateRainCoverCapability(environmentalAnalyses);
    const heatCapability = calculateHeatCapability(environmentalAnalyses);
    const capabilities = deriveRegionCapabilities({
      routingReady: routingProviderMetadata?.productionEligible === true,
      weatherAvailable:
        weatherBundle.current !== null || weatherBundle.hourlyForecast.length > 0,
      buildingsAvailable: sharedBuildings !== null,
      analyzedCandidateCount: environmentalAnalyses.length,
      shadeAvailableCount: environmentalAnalyses.filter(
        (analysis) => analysis.shadeAnalysis !== null,
      ).length,
      windAvailableCount: environmentalAnalyses.filter(
        (analysis) => analysis.windAnalysis !== null,
      ).length,
      rainAvailableCount: environmentalAnalyses.filter(
        (analysis) => analysis.rainAnalysis !== null,
      ).length,
      rainCoverProviderAvailable:
        coveredFeatureResult.metadata !== null &&
        coveredFeatureResult.metadata.mode !== "disabled",
      rainCoverConsumerEligible: rainCapability.consumerEligible,
      heatAvailableCount: environmentalAnalyses.filter(
        (analysis) => analysis.heatAnalysis !== null,
      ).length,
      heatConsumerEligible: heatCapability.consumerEligible,
    });
    const contextDecision = decideRoutingContext(weatherBundle, {
      rainCapable: capabilities.rainCover === "ready",
      heatCapable: capabilities.heat === "ready",
    });
    const profile = profileForContext(contextDecision.context);
    const analyzed = await Promise.all(
      environmentalAnalyses.map((analysis) =>
        this.finishCandidateComfort({
          analysis,
          departureTime: request.departureTime,
          weatherBundle,
          timing,
          profile,
          includeEnvironmentalDebug: request.includeEnvironmentalDebug ?? false,
          signal: options.signal,
        }),
      ),
    );
    performanceMs.candidateAnalysis = Math.round(performance.now() - candidateAnalysisStartedAt);
    performanceMs.shadeAnalysis = Math.round(timing.shadeAnalysis);
    performanceMs.windAnalysis = Math.round(timing.windAnalysis);
    performanceMs.rainAnalysis = Math.round(timing.rainAnalysis);
    performanceMs.heatAnalysis = Math.round(timing.heatAnalysis);
    performanceMs.comfortAnalysis = Math.round(timing.comfortAnalysis);

    throwIfAborted(options.signal);
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
      buildings: buildBuildingDebug(
        this.buildingProviderMode,
        sharedBuildings,
        buildingMetadata,
      ),
      coveredFeatures: buildCoveredFeatureDebug(
        this.coveredFeatureProviderMode,
        coveredFeatureResult.features,
        coveredFeatureResult.metadata,
        rainCapability.coverageQuality,
      ),
      routingProvider: routingProviderMetadata
        ? {
            ...routingProviderMetadata,
            publicDemo: routingProviderMetadata.mode === "public-demo",
            productionEligible: routingProviderMetadata.productionEligible,
          }
        : undefined,
      routingUsage,
      capabilities,
      context: {
        ...contextDecision,
        profile,
        rainCapable: capabilities.rainCover === "ready",
        heatCapable: capabilities.heat === "ready",
      },
      performanceMs,
    });
    performanceMs.reranking = Math.round(performance.now() - rerankingStartedAt);

    const serializationStartedAt = performance.now();
    comparison.debug.performanceMs = performanceMs;
    performanceMs.serialization = Math.round(performance.now() - serializationStartedAt);
    performanceMs.total = Math.round(performance.now() - startedAt);

    return comparison;
  }

  private async analyzeCandidateEnvironment({
    candidate,
    departureTime,
    weatherBundle,
    weatherCoordinate,
    includeEnvironmentalDebug,
    buildings,
    projectionOrigin,
    preparedShadowBuildingContext,
    preparedWindBuildingContext,
    coveredFeatures,
    timing,
    signal,
  }: {
    candidate: RouteCandidate & { routeOverlapRatio: number };
    departureTime: string;
    weatherBundle: WeatherBundle;
    weatherCoordinate: Coordinate;
    includeEnvironmentalDebug: boolean;
    buildings: Building[] | null;
    projectionOrigin: Coordinate;
    preparedShadowBuildingContext?: unknown;
    preparedWindBuildingContext?: unknown;
    coveredFeatures: CoveredFeature[] | null;
    timing: CandidateTiming;
    signal?: AbortSignal;
  }): Promise<CandidatePreComfortAnalysis> {
    throwIfAborted(signal);
    const shadeAnalysisTask = buildings
      ? timeAsync(timing, "shadeAnalysis", () =>
          this.shadeService.analyzeRouteShade({
            route: candidate,
            departureTime,
            buildings,
            projectionOrigin,
            preparedBuildingContext: preparedShadowBuildingContext,
            includeDebug: includeEnvironmentalDebug,
          }),
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
            projectionOrigin,
            preparedBuildingContext: preparedWindBuildingContext,
            includeDebug: includeEnvironmentalDebug,
          }),
        )
      : Promise.resolve(null);
    const rainAnalysisTask = coveredFeatures
      ? timeAsync(timing, "rainAnalysis", () =>
          this.rainService.analyzeRouteRain({
            route: candidate,
            departureTime,
            weatherBundle,
            weatherCoordinate,
            coveredFeatures,
          }),
        )
      : Promise.resolve(null);
    const [shadeResult, windResult, rainResult] = await Promise.allSettled([
      shadeAnalysisTask,
      windAnalysisTask,
      rainAnalysisTask,
    ]);
    const shadeAnalysis = resultValue<ShadeAnalysisResult | null>(shadeResult);
    const windAnalysis = resultValue<WindAnalysisResult | null>(windResult);
    const rainAnalysis = resultValue<RainAnalysisResult | null>(rainResult);
    const heatAnalysis = await timeAsync(timing, "heatAnalysis", () =>
      this.heatService.analyzeRouteHeat({
        route: candidate,
        departureTime,
        weatherBundle,
        weatherCoordinate,
        shadeAnalysis,
        windAnalysis,
      }),
    ).catch(() => null);
    throwIfAborted(signal);

    return {
      candidate,
      shadeAnalysis: includeEnvironmentalDebug ? shadeAnalysis : stripShadeDebug(shadeAnalysis),
      windAnalysis: includeEnvironmentalDebug ? windAnalysis : stripWindDebug(windAnalysis),
      rainAnalysis: includeEnvironmentalDebug ? rainAnalysis : stripRainDebug(rainAnalysis),
      heatAnalysis: includeEnvironmentalDebug ? heatAnalysis : stripHeatDebug(heatAnalysis),
      includeEnvironmentalDebug,
      error:
        !shadeAnalysis || !windAnalysis || !rainAnalysis || !heatAnalysis
          ? "One or more environmental analyses were unavailable for this candidate."
          : undefined,
    };
  }

  private async finishCandidateComfort({
    analysis,
    departureTime,
    weatherBundle,
    timing,
    profile,
    includeEnvironmentalDebug,
    signal,
  }: {
    analysis: CandidatePreComfortAnalysis;
    departureTime: string;
    weatherBundle: WeatherBundle;
    timing: CandidateTiming;
    profile: "cold" | "balanced" | "rain" | "heat";
    includeEnvironmentalDebug: boolean;
    signal?: AbortSignal;
  }): Promise<Omit<AnalyzedRouteCandidate, "role" | "metrics">> {
    throwIfAborted(signal);
    const comfortAnalysis = await timeAsync(timing, "comfortAnalysis", () =>
      this.analyzeComfort({
        candidate: analysis.candidate,
        departureTime,
        weatherBundle,
        shadeAnalysis: analysis.shadeAnalysis,
        windAnalysis: analysis.windAnalysis,
        rainAnalysis: analysis.rainAnalysis,
        heatAnalysis: analysis.heatAnalysis,
        profile,
      }),
    );

    return {
      id: analysis.candidate.id,
      route: analysis.candidate,
      status: comfortAnalysis?.routeComfortCost.comparable ? "complete" : "partial",
      routeOverlapRatio: analysis.candidate.routeOverlapRatio,
      shadeAnalysis: analysis.shadeAnalysis,
      windAnalysis: analysis.windAnalysis,
      rainAnalysis: analysis.rainAnalysis,
      heatAnalysis: analysis.heatAnalysis,
      comfortAnalysis: includeEnvironmentalDebug
        ? comfortAnalysis
        : stripComfortDebug(comfortAnalysis),
      error: !comfortAnalysis ? analysis.error ?? "Comfort analysis unavailable." : analysis.error,
    };
  }

  private async analyzeComfort({
    candidate,
    departureTime,
    weatherBundle,
    shadeAnalysis,
    windAnalysis,
    rainAnalysis,
    heatAnalysis,
    profile,
  }: {
    candidate: RouteCandidate;
    departureTime: string;
    weatherBundle: WeatherBundle;
    shadeAnalysis: ShadeAnalysisResult | null;
    windAnalysis: WindAnalysisResult | null;
    rainAnalysis: RainAnalysisResult | null;
    heatAnalysis: HeatAnalysisResult | null;
    profile: "cold" | "balanced" | "rain" | "heat";
  }): Promise<ComfortAnalysisResult | null> {
    try {
      return await this.comfortService.analyzeRouteComfort({
        route: candidate,
        departureTime,
        weatherBundle,
        shadeAnalysis,
        windAnalysis,
        rainAnalysis,
        heatAnalysis,
        profile,
      });
    } catch {
      return null;
    }
  }

  private async getSharedBuildings(
    candidates: RouteCandidate[],
    signal?: AbortSignal,
  ): Promise<Building[] | null> {
    if (candidates.length === 0) return [];
    try {
      return await this.buildingProvider.getBuildings(unionRouteBounds(candidates), {
        signal,
      });
    } catch {
      return null;
    }
  }

  private async getSharedCoveredFeatures(
    candidates: RouteCandidate[],
    signal?: AbortSignal,
  ): Promise<{
    features: CoveredFeature[] | null;
    metadata: CoveredFeatureProviderMetadata | null;
  }> {
    if (!this.coveredFeatureProvider || candidates.length === 0) {
      return { features: null, metadata: null };
    }

    try {
      const result = await this.coveredFeatureProvider.getCoveredFeatures(
        unionRouteBounds(candidates),
        { signal },
      );
      return { features: result.features, metadata: result.metadata };
    } catch {
      return { features: null, metadata: null };
    }
  }

  private async getBuildingMetadata() {
    try {
      return (await this.buildingProvider.getMetadata?.()) ?? null;
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

function stripRainDebug(analysis: RainAnalysisResult | null) {
  if (!analysis?.debug) return analysis;
  return { ...analysis, debug: undefined };
}

function stripHeatDebug(analysis: HeatAnalysisResult | null) {
  if (!analysis?.debug) return analysis;
  return { ...analysis, debug: undefined };
}

function stripComfortDebug(analysis: ComfortAnalysisResult | null) {
  if (!analysis?.debug) return analysis;
  return { ...analysis, debug: undefined };
}

function profileForContext(context: RoutingContext): "cold" | "balanced" | "rain" | "heat" {
  if (context === "rain") return "rain";
  if (context === "heat") return "heat";
  if (context === "cold") return "cold";
  return "balanced";
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
  let detourFilteringMs = 0;

  for (const candidate of candidates) {
    const candidateStartedAt = performance.now();
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
      detourFilteringMs += performance.now() - candidateStartedAt;
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

    detourFilteringMs += performance.now() - candidateStartedAt;
    accepted.push(candidate);
  }

  return {
    accepted,
    detourFilteredCandidates,
    diversityFilteredCandidates,
    rejectedCandidates,
    detourFilteringMs,
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw new DOMException("The operation was aborted.", "AbortError");
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
  const rains = candidates.flatMap((candidate) =>
    candidate.rainAnalysis ? [candidate.rainAnalysis.summary.averageRainExposure] : [],
  );
  const heats = candidates.flatMap((candidate) =>
    candidate.heatAnalysis ? [candidate.heatAnalysis.summary.averageHeatExposure] : [],
  );
  const directSun = candidates.flatMap((candidate) =>
    candidate.heatAnalysis ? [candidate.heatAnalysis.summary.directSunRatio] : [],
  );
  const overlaps = candidates.map((candidate) => candidate.routeOverlapRatio);

  return {
    rawEnvironmentalCostRange: numericRange(costs),
    windExposureRange: numericRange(winds),
    rainExposureRange: numericRange(rains),
    heatExposureRange: numericRange(heats),
    directSunRatioRange: numericRange(directSun),
    shadeRatioRange: numericRange(shades),
    routeOverlapRange: numericRange(overlaps),
  };
}

function buildBuildingDebug(
  providerMode: string,
  buildings: Building[] | null,
  metadata: BuildingProviderMetadata | null,
) {
  return {
    providerMode,
    provider: metadata?.provider,
    datasetVersion: metadata?.datasetVersion,
    generatedAt: metadata?.generatedAt,
    region: metadata?.region,
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

function buildCoveredFeatureDebug(
  providerMode: string,
  features: CoveredFeature[] | null,
  metadata: CoveredFeatureProviderMetadata | null,
  rainCoverCoverageQuality = 0,
): ComfortRouteComparisonDebug["coveredFeatures"] {
  const eligibleFeatures = features?.filter(isRainCoverEligible).length ?? 0;
  return {
    providerMode,
    provider: metadata?.provider,
    source: metadata?.source,
    datasetVersion: metadata?.datasetVersion,
    region: metadata?.region,
    loadedFeatures: features?.length ?? 0,
    eligibleFeatures,
    restrictedFeatures: features ? features.length - eligibleFeatures : 0,
    rainCoverCoverageQuality,
    querySucceeded: features !== null,
  };
}

function calculateRainCoverCapability(
  analyses: Array<{ rainAnalysis: RainAnalysisResult | null }>,
) {
  const summaries = analyses.flatMap((analysis) =>
    analysis.rainAnalysis ? [analysis.rainAnalysis.summary] : [],
  );
  const coverageQuality = summaries.reduce((max, summary) => {
    const routeRatio =
      summary.analyzedMeters > 0 ? summary.coveredMeters / summary.analyzedMeters : 0;
    const continuousRatio =
      summary.analyzedMeters > 0
        ? summary.longestContinuousCoveredMeters / summary.analyzedMeters
        : 0;
    return Math.max(max, routeRatio * 0.7 + continuousRatio * 0.3);
  }, 0);
  const consumerEligible = summaries.some((summary) => {
    const routeRatio =
      summary.analyzedMeters > 0 ? summary.coveredMeters / summary.analyzedMeters : 0;
    return (
      summary.completeness >= 0.75 &&
      summary.confidence >= 0.45 &&
      (summary.coveredMeters >= 30 || routeRatio >= 0.03) &&
      summary.longestContinuousCoveredMeters >= 12
    );
  });

  return {
    coverageQuality,
    consumerEligible,
  };
}

function calculateHeatCapability(
  analyses: Array<{ heatAnalysis: HeatAnalysisResult | null; shadeAnalysis: ShadeAnalysisResult | null }>,
) {
  const summaries = analyses.flatMap((analysis) =>
    analysis.heatAnalysis ? [analysis.heatAnalysis.summary] : [],
  );
  const shadeSummaries = analyses.flatMap((analysis) =>
    analysis.shadeAnalysis ? [analysis.shadeAnalysis.summary] : [],
  );
  const coverageQuality = summaries.reduce(
    (max, summary) => Math.max(max, summary.completeness * 0.7 + summary.confidence * 0.3),
    0,
  );
  const hasShadeDiversity =
    numericRange(shadeSummaries.map((summary) => summary.shadeRatio)) !== null;
  const consumerEligible = summaries.some(
    (summary) =>
      summary.completeness >= 0.75 &&
      summary.confidence >= 0.45 &&
      (summary.averageHeatExposure > 0.2 ||
        summary.directSunRatio >= 0.25 ||
        summary.longestContinuousSunMeters >= 30),
  );

  return {
    coverageQuality,
    consumerEligible: consumerEligible && hasShadeDiversity,
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
