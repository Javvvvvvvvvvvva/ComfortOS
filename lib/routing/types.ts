import type { Coordinate, LineStringGeometry } from "@/lib/geo/types";

export type RouteRequest = {
  origin: Coordinate;
  destination: Coordinate;
  departureTime: string;
  waypoints?: Coordinate[];
};

export type RouteResult = {
  geometry: LineStringGeometry;
  distanceMeters: number;
  durationSeconds: number;
  snappedOrigin?: Coordinate;
  snappedDestination?: Coordinate;
  provider?: {
    id: string;
    dataVersion?: string;
  };
};

export type RoutingProviderMode = "public-demo" | "self-hosted" | "managed";

export type RoutingProviderMetadata = {
  id: string;
  name: string;
  mode: RoutingProviderMode;
  profile: "foot" | "walking";
  baseUrl: string;
  endpointFamily: string;
  productionEligible: boolean;
  capabilities: {
    alternatives: boolean;
    waypoints: boolean;
    maxCoordinates: number;
    timeDependent: boolean;
  };
};

export type RoutingProviderHealth = {
  ok: boolean;
  status: "ready" | "unavailable";
  latencyMs: number;
  provider: RoutingProviderMetadata;
  message?: string;
};

export type RouteCandidate = RouteResult & {
  id: string;
  sourceRouteIndex: number;
  generation?: {
    generator: "provider-alternative" | "corridor-waypoint" | "fallback";
    attemptId?: string;
    waypoint?: Coordinate;
  };
};

export type RouteCandidateSet = {
  candidates: RouteCandidate[];
  provider?: RouteResult["provider"];
};

export type RoutingRequestOptions = {
  signal?: AbortSignal;
  usageCategory?: "fastest" | "candidate" | "health";
  usageMetrics?: RoutingUsageMetrics;
};

export type RoutingUsageMetrics = {
  fastestRequests: number;
  candidateRequests: number;
  failedRequests: number;
  totalRequests: number;
};

export function createRoutingUsageMetrics(): RoutingUsageMetrics {
  return {
    fastestRequests: 0,
    candidateRequests: 0,
    failedRequests: 0,
    totalRequests: 0,
  };
}

export interface RoutingProvider {
  getWalkingRoute(request: RouteRequest, options?: RoutingRequestOptions): Promise<RouteResult>;
  getWalkingRouteCandidates?(
    request: RouteRequest,
    options?: RoutingRequestOptions,
  ): Promise<RouteCandidateSet>;
  getMetadata?(): RoutingProviderMetadata | Promise<RoutingProviderMetadata>;
  checkHealth?(options?: RoutingRequestOptions): Promise<RoutingProviderHealth>;
}
