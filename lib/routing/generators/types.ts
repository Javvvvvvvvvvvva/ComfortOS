import type { Coordinate } from "@/lib/geo/types";
import type { RouteCandidateSet, RouteRequest, RouteResult } from "@/lib/routing/types";

export type CandidateGenerationPolicy = {
  corridorWidthMeters: number;
  offsetDistancesMeters: number[];
  routeSampleRatios: number[];
  maxCandidateAttempts: number;
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
  maxEnvironmentAnalyzedCandidates: 5,
  minUniqueMeters: 40,
  maxPreAnalysisDurationRatio: 0.45,
  maxPreAnalysisDistanceRatio: 0.45,
};

export type CandidateGenerationContext = {
  fastestRoute?: RouteResult;
  policy?: Partial<CandidateGenerationPolicy>;
};

export type CandidateGenerator = {
  id: "osrm-alternative" | "corridor-waypoint";
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
