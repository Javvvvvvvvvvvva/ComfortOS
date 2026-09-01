import type { Coordinate } from "@/lib/geo/types";
import type {
  RouteCandidateSet,
  RouteRequest,
  RouteResult,
  RoutingUsageMetrics,
} from "@/lib/routing/types";

export type CandidateGenerationPolicy = {
  corridorWidthMeters: number;
  offsetDistancesMeters: number[];
  routeSampleRatios: number[];
  maxCandidateAttempts: number;
  maxConcurrentCandidateRequests: number;
  earlyStopDiverseCandidateCount: number;
  adaptiveAttempts: boolean;
  maxEnvironmentAnalyzedCandidates: number;
  minUniqueMeters: number;
  maxPreAnalysisDurationRatio: number;
  maxPreAnalysisDistanceRatio: number;
};

export const DEFAULT_CANDIDATE_GENERATION_POLICY: CandidateGenerationPolicy = {
  corridorWidthMeters: 260,
  offsetDistancesMeters: [120, 220],
  routeSampleRatios: [0.5, 0.33, 0.67],
  maxCandidateAttempts: 8,
  maxConcurrentCandidateRequests: 1,
  earlyStopDiverseCandidateCount: Number.POSITIVE_INFINITY,
  adaptiveAttempts: false,
  maxEnvironmentAnalyzedCandidates: 5,
  minUniqueMeters: 40,
  maxPreAnalysisDurationRatio: 0.45,
  maxPreAnalysisDistanceRatio: 0.45,
};

export type CandidateGenerationContext = {
  fastestRoute?: RouteResult;
  policy?: Partial<CandidateGenerationPolicy>;
  signal?: AbortSignal;
  usageMetrics?: RoutingUsageMetrics;
  diagnostics?: CandidateGenerationDiagnostics;
};

export type CandidateGenerationDiagnostics = {
  recordStage?(stage: string, durationMs: number, metadata?: Record<string, unknown>): void;
};

export type CandidateGenerator = {
  id: "provider-alternative" | "corridor-waypoint";
  generateCandidates(
    request: RouteRequest,
    context?: CandidateGenerationContext,
  ): Promise<RouteCandidateSet>;
};

export type CandidateWaypointAttempt = {
  id: string;
  waypoint: Coordinate;
  sampleRatio: number;
  offsetMeters: number;
  side: "left" | "right";
};
