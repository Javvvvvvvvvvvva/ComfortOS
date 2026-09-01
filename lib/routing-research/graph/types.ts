import type { LineStringGeometry, Coordinate } from "@/lib/geo/types";

export type PedestrianNode = {
  id: string;
  coordinate: Coordinate;
};

export type PedestrianEdge = {
  id: string;
  from: string;
  to: string;
  geometry: LineStringGeometry;
  distanceMeters: number;
  durationSeconds: number;
  bearingDegrees: number;
  walkable: boolean;
  sourceRouteIds: string[];
  surface?: string | null;
  incline?: number | null;
};

export type PedestrianGraph = {
  id: string;
  nodes: Map<string, PedestrianNode>;
  edges: Map<string, PedestrianEdge>;
  adjacency: Map<string, PedestrianEdge[]>;
  source: string;
};
