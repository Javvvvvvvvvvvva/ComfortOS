import assert from "node:assert/strict";
import test from "node:test";
import type { EdgeEnvironment } from "@/lib/routing-research/cost/types";
import type { PedestrianEdge, PedestrianGraph, PedestrianNode } from "@/lib/routing-research/graph/types";
import { searchResearchRoute } from "@/lib/routing-research/search/dijkstra";
import { MINNEAPOLIS_WINTER_SCENARIOS, assertResearchScenarioAllowed } from "@/lib/routing-research/environment/scenarios";
import { CONTROLLED_HEAT_SCENARIOS, heatScenarioToWeatherBundle } from "@/lib/routing-research/environment/heatScenarios";

test("lambda search can choose a slightly longer sheltered path", async () => {
  const graph = syntheticGraph();
  const lookup = syntheticLookup({
    "A->B:f": 8,
    "B->D:f": 8,
    "A->C:f": 1,
    "C->D:f": 1,
  });

  const fastest = await searchResearchRoute({
    graph,
    originNodeId: "A",
    destinationNodeId: "D",
    mode: { type: "fastest" },
    departureTime: "2026-01-15T18:00:00.000Z",
    environmentCache: lookup,
  });
  const comfort = await searchResearchRoute({
    graph,
    originNodeId: "A",
    destinationNodeId: "D",
    mode: { type: "lambda", lambda: 2 },
    departureTime: "2026-01-15T18:00:00.000Z",
    environmentCache: lookup,
  });

  assert.deepEqual(fastest?.nodeIds, ["A", "B", "D"]);
  assert.deepEqual(comfort?.nodeIds, ["A", "C", "D"]);
});

test("bounded environmental search respects detour policy", async () => {
  const graph = syntheticGraph();
  const lookup = syntheticLookup({
    "A->B:f": 8,
    "B->D:f": 8,
    "A->C:f": 1,
    "C->D:f": 1,
  });

  const route = await searchResearchRoute({
    graph,
    originNodeId: "A",
    destinationNodeId: "D",
    mode: {
      type: "bounded-environment",
      maxExtraDurationRatio: 0.1,
      maxExtraDurationSeconds: 5,
    },
    departureTime: "2026-01-15T18:00:00.000Z",
    environmentCache: lookup,
    fastestDurationSeconds: 20,
  });

  assert.deepEqual(route?.nodeIds, ["A", "B", "D"]);
});

test("controlled winter scenarios are fixed research inputs", () => {
  assert.equal(MINNEAPOLIS_WINTER_SCENARIOS.length, 4);
  assert.equal(MINNEAPOLIS_WINTER_SCENARIOS[0].source, "research-scenario");
  assert.equal(MINNEAPOLIS_WINTER_SCENARIOS[0].timestamp, "2026-01-15T18:00:00.000Z");
});

test("controlled heat scenarios are fixed research inputs", () => {
  assert.deepEqual(
    CONTROLLED_HEAT_SCENARIOS.map((scenario) => scenario.id),
    ["HEAT_EXTREME_SUN", "HEAT_HOT_SUN", "HEAT_HOT_LATE_DAY", "HEAT_HOT_NIGHT"],
  );
  assert.equal(CONTROLLED_HEAT_SCENARIOS[0].source, "research-scenario");
  const bundle = heatScenarioToWeatherBundle(CONTROLLED_HEAT_SCENARIOS[0], {
    latitude: 33.45,
    longitude: -112.07,
  });

  assert.equal(bundle.source, "research-scenario");
  assert.equal(bundle.current?.source, "research-scenario");
  assert.equal(bundle.current?.temperatureC, 44);
});

test("research scenarios are rejected in production unless explicitly enabled", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.COMFORTOS_ENABLE_RESEARCH_ROUTING;
  try {
    setEnv("NODE_ENV", "production");
    delete process.env.COMFORTOS_ENABLE_RESEARCH_ROUTING;
    assert.throws(() => assertResearchScenarioAllowed(), /disabled in production/);
    process.env.COMFORTOS_ENABLE_RESEARCH_ROUTING = "true";
    assert.doesNotThrow(() => assertResearchScenarioAllowed());
  } finally {
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("COMFORTOS_ENABLE_RESEARCH_ROUTING", originalFlag);
  }
});

function syntheticGraph(): PedestrianGraph {
  const nodes = new Map<string, PedestrianNode>(
    ["A", "B", "C", "D"].map((id, index) => [
      id,
      { id, coordinate: { latitude: 44.97 + index * 0.001, longitude: -93.26 } },
    ]),
  );
  const edges = new Map<string, PedestrianEdge>();
  const adjacency = new Map<string, PedestrianEdge[]>();
  for (const graphEdge of [
    makeEdge("A", "B", 10),
    makeEdge("B", "D", 10),
    makeEdge("A", "C", 14),
    makeEdge("C", "D", 14),
  ]) {
    edges.set(graphEdge.id, graphEdge);
    adjacency.set(graphEdge.from, [...(adjacency.get(graphEdge.from) ?? []), graphEdge]);
  }

  return { id: "synthetic", nodes, edges, adjacency, source: "test" };
}

function makeEdge(from: string, to: string, durationSeconds: number): PedestrianEdge {
  return {
    id: `${from}->${to}:f`,
    from,
    to,
    geometry: {
      type: "LineString",
      coordinates: [
        [-93.26, 44.97],
        [-93.25, 44.98],
      ],
    },
    distanceMeters: durationSeconds,
    durationSeconds,
    bearingDegrees: 0,
    walkable: true,
    sourceRouteIds: ["synthetic"],
  };
}

function syntheticLookup(costs: Record<string, number>) {
  return {
    async get(edgeValue: PedestrianEdge, departureTime: string): Promise<EdgeEnvironment> {
      return {
        edgeId: edgeValue.id,
        timestamp: departureTime,
        environmentalExposureCost: costs[edgeValue.id] ?? 99,
        confidence: 1,
        comparable: true,
      };
    },
  };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function setEnv(name: string, value: string) {
  (process.env as Record<string, string | undefined>)[name] = value;
}
