import type { PedestrianEdge, PedestrianGraph } from "@/lib/routing-research/graph/types";
import type { EdgeEnvironment } from "@/lib/routing-research/cost/types";
import type { ResearchRoute } from "@/lib/routing-research/cost/types";

export type ResearchSearchMode =
  | { type: "fastest" }
  | { type: "lambda"; lambda: number }
  | { type: "bounded-environment"; maxExtraDurationRatio: number; maxExtraDurationSeconds: number };

export type EdgeEnvironmentLookup = {
  get(edge: PedestrianEdge, departureTime: string, arrivalSeconds: number): Promise<EdgeEnvironment>;
};

export async function searchResearchRoute({
  graph,
  originNodeId,
  destinationNodeId,
  mode,
  departureTime,
  environmentCache,
  fastestDurationSeconds,
}: {
  graph: PedestrianGraph;
  originNodeId: string;
  destinationNodeId: string;
  mode: ResearchSearchMode;
  departureTime: string;
  environmentCache?: EdgeEnvironmentLookup;
  fastestDurationSeconds?: number;
}): Promise<ResearchRoute | null> {
  const distances = new Map<string, number>([[originNodeId, 0]]);
  const travelSeconds = new Map<string, number>([[originNodeId, 0]]);
  const previous = new Map<string, { nodeId: string; edge: PedestrianEdge }>();
  const queue = new Set<string>([originNodeId]);
  const maxDuration =
    mode.type === "bounded-environment" && fastestDurationSeconds !== undefined
      ? fastestDurationSeconds + Math.min(mode.maxExtraDurationSeconds, fastestDurationSeconds * mode.maxExtraDurationRatio)
      : Infinity;

  while (queue.size > 0) {
    const current = minBy(queue, (nodeId) => distances.get(nodeId) ?? Infinity);
    queue.delete(current);
    if (current === destinationNodeId) break;

    for (const edge of graph.adjacency.get(current) ?? []) {
      if (!edge.walkable) continue;
      const nextTravelSeconds = (travelSeconds.get(current) ?? 0) + edge.durationSeconds;
      if (nextTravelSeconds > maxDuration) continue;
      const edgeCost = await costForEdge({
        edge,
        mode,
        departureTime,
        arrivalSeconds: travelSeconds.get(current) ?? 0,
        environmentCache,
      });
      const nextCost = (distances.get(current) ?? 0) + edgeCost;
      if (nextCost < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, nextCost);
        travelSeconds.set(edge.to, nextTravelSeconds);
        previous.set(edge.to, { nodeId: current, edge });
        queue.add(edge.to);
      }
    }
  }

  if (!previous.has(destinationNodeId) && originNodeId !== destinationNodeId) return null;
  const edges: PedestrianEdge[] = [];
  const nodeIds = [destinationNodeId];
  let current = destinationNodeId;
  while (current !== originNodeId) {
    const item = previous.get(current);
    if (!item) return null;
    edges.unshift(item.edge);
    current = item.nodeId;
    nodeIds.unshift(current);
  }

  return summarizeRoute(edges, nodeIds, departureTime, environmentCache);
}

async function costForEdge({
  edge,
  mode,
  departureTime,
  arrivalSeconds,
  environmentCache,
}: {
  edge: PedestrianEdge;
  mode: ResearchSearchMode;
  departureTime: string;
  arrivalSeconds: number;
  environmentCache?: EdgeEnvironmentLookup;
}) {
  if (mode.type === "fastest") return edge.durationSeconds;
  if (!environmentCache) return edge.durationSeconds;
  const environment = await environmentCache.get(edge, departureTime, arrivalSeconds);
  if (mode.type === "bounded-environment") return environment.environmentalExposureCost;
  return edge.durationSeconds + mode.lambda * environment.environmentalExposureCost * 60;
}

async function summarizeRoute(
  edges: PedestrianEdge[],
  nodeIds: string[],
  departureTime: string,
  environmentCache?: EdgeEnvironmentLookup,
): Promise<ResearchRoute> {
  let environmentalExposureCost = 0;
  let windExposure = 0;
  let headwind = 0;
  let shade = 0;
  let confidence = 0;
  let elapsed = 0;
  const distanceMeters = edges.reduce((sum, edge) => sum + edge.distanceMeters, 0);
  const durationSeconds = edges.reduce((sum, edge) => sum + edge.durationSeconds, 0);

  for (const edge of edges) {
    const weight = edge.distanceMeters / Math.max(1, distanceMeters);
    if (environmentCache) {
      const environment = await environmentCache.get(edge, departureTime, elapsed);
      environmentalExposureCost += environment.environmentalExposureCost;
      windExposure += (environment.estimatedWindExposureMps ?? 0) * weight;
      headwind += (environment.headwindComponentMps ?? 0) * weight;
      shade += (environment.buildingShadeRatio ?? 0) * weight;
      confidence += environment.confidence * weight;
    }
    elapsed += edge.durationSeconds;
  }

  return {
    nodeIds,
    edges,
    distanceMeters,
    durationSeconds,
    environmentalExposureCost,
    averageEnvironmentalCost: durationSeconds > 0 ? environmentalExposureCost / (durationSeconds / 60) : 0,
    averageWindExposureMps: windExposure,
    averageHeadwindMps: headwind,
    averageShadeRatio: shade,
    confidence,
  };
}

function minBy(values: Set<string>, score: (value: string) => number) {
  let best: string | null = null;
  let bestScore = Infinity;
  for (const value of values) {
    const valueScore = score(value);
    if (valueScore < bestScore) {
      best = value;
      bestScore = valueScore;
    }
  }
  if (!best) throw new Error("Queue is empty.");
  return best;
}
