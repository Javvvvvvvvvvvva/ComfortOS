import { bearing, distance } from "@turf/turf";
import type { Coordinate, LineStringGeometry } from "@/lib/geo/types";
import type { RouteCandidate, RouteResult } from "@/lib/routing/types";
import type { PedestrianEdge, PedestrianGraph, PedestrianNode } from "@/lib/routing-research/graph/types";

export const RESEARCH_WALKING_SPEED_MPS = 1.34;

export function buildResearchGraphFromRoutes({
  id,
  routes,
}: {
  id: string;
  routes: Array<(RouteCandidate | RouteResult) & { id?: string }>;
}): PedestrianGraph {
  const nodes = new Map<string, PedestrianNode>();
  const edges = new Map<string, PedestrianEdge>();
  const adjacency = new Map<string, PedestrianEdge[]>();

  for (const [routeIndex, route] of routes.entries()) {
    const routeId = route.id ?? `route-${routeIndex}`;
    const coordinates = route.geometry.coordinates;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
      const fromCoordinate = toCoordinate(coordinates[index]);
      const toCoordinateValue = toCoordinate(coordinates[index + 1]);
      const from = nodeId(fromCoordinate);
      const to = nodeId(toCoordinateValue);
      if (from === to) continue;

      nodes.set(from, { id: from, coordinate: fromCoordinate });
      nodes.set(to, { id: to, coordinate: toCoordinateValue });

      const forward = makeEdge({
        routeId,
        suffix: "f",
        from,
        to,
        fromCoordinate,
        toCoordinate: toCoordinateValue,
      });
      const reverse = makeEdge({
        routeId,
        suffix: "r",
        from: to,
        to: from,
        fromCoordinate: toCoordinateValue,
        toCoordinate: fromCoordinate,
      });
      upsertEdge(edges, adjacency, forward);
      upsertEdge(edges, adjacency, reverse);
    }
  }

  return {
    id,
    nodes,
    edges,
    adjacency,
    source: "bounded-osrm-osm-pedestrian-corridor",
  };
}

export function nearestGraphNode(graph: PedestrianGraph, coordinate: Coordinate) {
  let best: { id: string; distanceMeters: number } | null = null;
  for (const node of graph.nodes.values()) {
    const distanceMeters = distance(
      [coordinate.longitude, coordinate.latitude],
      [node.coordinate.longitude, node.coordinate.latitude],
      { units: "kilometers" },
    ) * 1000;
    if (!best || distanceMeters < best.distanceMeters) {
      best = { id: node.id, distanceMeters };
    }
  }
  if (!best) throw new Error("Research graph has no nodes.");
  return best;
}

function makeEdge({
  routeId,
  suffix,
  from,
  to,
  fromCoordinate,
  toCoordinate,
}: {
  routeId: string;
  suffix: string;
  from: string;
  to: string;
  fromCoordinate: Coordinate;
  toCoordinate: Coordinate;
}): PedestrianEdge {
  const distanceMeters = distance(
    [fromCoordinate.longitude, fromCoordinate.latitude],
    [toCoordinate.longitude, toCoordinate.latitude],
    { units: "kilometers" },
  ) * 1000;
  const bearingDegrees = (bearing(
    [fromCoordinate.longitude, fromCoordinate.latitude],
    [toCoordinate.longitude, toCoordinate.latitude],
  ) + 360) % 360;
  const geometry: LineStringGeometry = {
    type: "LineString",
    coordinates: [
      [fromCoordinate.longitude, fromCoordinate.latitude],
      [toCoordinate.longitude, toCoordinate.latitude],
    ],
  };

  return {
    id: `${from}->${to}:${suffix}`,
    from,
    to,
    geometry,
    distanceMeters,
    durationSeconds: distanceMeters / RESEARCH_WALKING_SPEED_MPS,
    bearingDegrees,
    walkable: true,
    sourceRouteIds: [routeId],
  };
}

function upsertEdge(
  edges: Map<string, PedestrianEdge>,
  adjacency: Map<string, PedestrianEdge[]>,
  edge: PedestrianEdge,
) {
  const existing = edges.get(edge.id);
  if (existing) {
    existing.sourceRouteIds = Array.from(new Set([...existing.sourceRouteIds, ...edge.sourceRouteIds]));
    return;
  }
  edges.set(edge.id, edge);
  adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge]);
}

function nodeId(coordinate: Coordinate) {
  return `${coordinate.longitude.toFixed(5)},${coordinate.latitude.toFixed(5)}`;
}

function toCoordinate(coordinate: [number, number]): Coordinate {
  return { longitude: coordinate[0], latitude: coordinate[1] };
}
