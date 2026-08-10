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

export type RouteCandidate = RouteResult & {
  id: string;
  sourceRouteIndex: number;
  generation?: {
    generator: "osrm-alternative" | "corridor-waypoint" | "fallback";
    attemptId?: string;
    waypoint?: Coordinate;
  };
};

export type RouteCandidateSet = {
  candidates: RouteCandidate[];
  provider?: RouteResult["provider"];
};

export interface RoutingProvider {
  getWalkingRoute(request: RouteRequest): Promise<RouteResult>;
  getWalkingRouteCandidates?(request: RouteRequest): Promise<RouteCandidateSet>;
}
