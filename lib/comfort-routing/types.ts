import type { ComfortAnalysisResult } from "@/lib/comfort/types";
import type { ShadeAnalysisResult } from "@/lib/environment/shade/types";
import type { WindAnalysisResult } from "@/lib/environment/wind/types";
import type { RouteCandidate } from "@/lib/routing/types";
import type { ComfortRouteRerankingPolicy } from "@/lib/comfort-routing/policy";

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
    mode: "osrm-only" | "enhanced";
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
      shadeRatioRange: number | null;
      routeOverlapRange: number | null;
    };
  };
  performanceMs?: {
    routingCandidates: number;
    buildingFetch?: number;
    weather: number;
    shadeAnalysis?: number;
    windAnalysis?: number;
    comfortAnalysis?: number;
    candidateAnalysis: number;
    reranking: number;
    total: number;
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
