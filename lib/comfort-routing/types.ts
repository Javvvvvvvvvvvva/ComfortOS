import type { ComfortAnalysisResult } from "@/lib/comfort/types";
import type { ShadeAnalysisResult } from "@/lib/environment/shade/types";
import type { WindAnalysisResult } from "@/lib/environment/wind/types";
import type { RainAnalysisResult } from "@/lib/environment/rain/types";
import type { HeatAnalysisResult } from "@/lib/environment/heat/types";
import type {
  RouteCandidate,
  RoutingProviderMetadata,
  RoutingUsageMetrics,
} from "@/lib/routing/types";
import type { ComfortRouteRerankingPolicy } from "@/lib/comfort-routing/policy";
import type { RoutingContextDecision } from "@/lib/comfort-routing/contextualMode";
import type { RegionCapabilities } from "@/lib/regions/capabilities";

export type RouteCandidateRole = "fastest" | "comfort" | "fastest-and-comfort" | "alternative";

export type RouteCandidateAnalysisStatus = "complete" | "partial" | "failed";

export type RouteCandidateComparisonMetrics = {
  routeOverlapRatio: number;
  overlapWithFastest: number;
  uniqueMeters: number;
  maxLateralSeparationMeters: number;
  extraDurationSeconds: number;
  extraDistanceMeters: number;
  environmentalCostReductionRatio: number;
  detourEligible: boolean;
  meaningfulImprovement: boolean;
};

export type AnalyzedRouteCandidate = {
  id: string;
  role: RouteCandidateRole;
  route: RouteCandidate;
  status: RouteCandidateAnalysisStatus;
  routeOverlapRatio: number;
  shadeAnalysis?: ShadeAnalysisResult | null;
  windAnalysis?: WindAnalysisResult | null;
  rainAnalysis?: RainAnalysisResult | null;
  heatAnalysis?: HeatAnalysisResult | null;
  comfortAnalysis?: ComfortAnalysisResult | null;
  metrics: RouteCandidateComparisonMetrics;
  error?: string;
};

export type ComfortRouteComparisonDebug = {
  note: string;
  deduplication: {
    overlapRatioThreshold: number;
  };
  generation?: {
    mode: "provider-only" | "osrm-only" | "enhanced";
    generatedCandidates: number;
    deduplicatedCandidates: number;
    detourFilteredCandidates: number;
    diversityFilteredCandidates: number;
    environmentAnalyzedCandidates: number;
    rejectedCandidates: Array<{
      id: string;
      generator: string;
      reason: string;
    }>;
    diversity?: {
      rawEnvironmentalCostRange: number | null;
      windExposureRange: number | null;
      rainExposureRange: number | null;
      heatExposureRange: number | null;
      directSunRatioRange: number | null;
      shadeRatioRange: number | null;
      routeOverlapRange: number | null;
    };
  };
  performanceMs?: {
    fastestRoute?: number;
    candidateGeneration?: number;
    providerAlternatives?: number;
    osrmBaseline?: number;
    corridorCandidates?: number;
    candidateNormalization?: number;
    candidateDedupe?: number;
    detourFiltering?: number;
    diversityFiltering?: number;
    routingCandidates: number;
    buildingFetch?: number;
    buildingMetadata?: number;
    buildingPreparation?: number;
    coveredFeatureFetch?: number;
    rainAnalysis?: number;
    heatAnalysis?: number;
    weather: number;
    shadeAnalysis?: number;
    windAnalysis?: number;
    comfortAnalysis?: number;
    candidateAnalysis: number;
    reranking: number;
    serialization?: number;
    total: number;
  };
  buildings?: {
    providerMode: string;
    provider?: string;
    datasetVersion?: string;
    generatedAt?: string;
    region?: string;
    loadedBuildings: number;
    explicitHeightBuildings: number;
    floorDerivedHeightBuildings: number;
    unknownHeightBuildings: number;
    querySucceeded: boolean;
  };
  coveredFeatures?: {
    providerMode: string;
    provider?: string;
    source?: string;
    datasetVersion?: string;
    region?: string;
    loadedFeatures: number;
    eligibleFeatures?: number;
    restrictedFeatures?: number;
    rainCoverCoverageQuality?: number;
    querySucceeded: boolean;
  };
  routingProvider?: RoutingProviderMetadata & {
    publicDemo: boolean;
    productionEligible: boolean;
  };
  routingUsage?: RoutingUsageMetrics;
  capabilities?: RegionCapabilities;
  context?: RoutingContextDecision & {
    profile: "cold" | "balanced" | "rain" | "heat";
    rainCapable: boolean;
    heatCapable: boolean;
  };
  candidates: Array<{
    id: string;
    durationSeconds: number;
    distanceMeters: number;
    routeOverlapRatio: number;
    overlapWithFastest: number;
    uniqueMeters: number;
    maxLateralSeparationMeters: number;
    generator: string;
    waypoint?: {
      latitude: number;
      longitude: number;
    };
    rawEnvironmentalCost: number | null;
    comfortScore: number | null;
    rainExposure: number | null;
    coveredMeters: number | null;
    coveredRatio: number | null;
    longestContinuousCoveredMeters: number | null;
    coveredSegmentCount: number | null;
    rainConfidence: number | null;
    heatExposure: number | null;
    directSunRatio: number | null;
    longestContinuousSunMeters: number | null;
    longestContinuousSunSeconds: number | null;
    heatConfidence: number | null;
    confidence: number;
    completeness: number;
    comparable: boolean;
    detourEligible: boolean;
    meaningfulImprovement: boolean;
    selectedRole: RouteCandidateRole;
  }>;
};

export type ComfortRouteComparisonResult = {
  fastest: AnalyzedRouteCandidate;
  comfort: AnalyzedRouteCandidate;
  candidates: AnalyzedRouteCandidate[];
  policy: ComfortRouteRerankingPolicy;
  provider?: RouteCandidate["provider"];
  debug: ComfortRouteComparisonDebug;
};
