import assert from "node:assert/strict";
import test from "node:test";
import type { ComfortAnalysisResult } from "@/lib/comfort/types";
import { selectComfortRouteComparison } from "@/lib/comfort-routing/selector";
import type { AnalyzedRouteCandidate } from "@/lib/comfort-routing/types";
import type { RouteCandidate } from "@/lib/routing/types";

test("selects a comfort route when raw environmental cost improves meaningfully within detour policy", () => {
  const comparison = selectComfortRouteComparison({
    candidates: [
      candidate("fast", 8, 800, 80, true),
      candidate("comfort", 10, 900, 55, true),
    ],
  });

  assert.equal(comparison.fastest.id, "fast");
  assert.equal(comparison.comfort.id, "comfort");
  assert.equal(comparison.comfort.role, "comfort");
});

test("keeps fastest when the lower-cost alternative exceeds detour policy", () => {
  const comparison = selectComfortRouteComparison({
    candidates: [
      candidate("fast", 8, 800, 80, true),
      candidate("long", 20, 1800, 40, true),
    ],
  });

  assert.equal(comparison.comfort.id, "fast");
  assert.equal(comparison.fastest.role, "fastest-and-comfort");
});

test("incomplete candidates cannot win comfort reranking", () => {
  const comparison = selectComfortRouteComparison({
    candidates: [
      candidate("fast", 8, 800, 80, true),
      candidate("partial", 10, 900, 30, false),
    ],
  });

  assert.equal(comparison.comfort.id, "fast");
  assert.equal(comparison.candidates.find((value) => value.id === "partial")?.status, "partial");
});

test("does not force a separate comfort route for a tiny raw-cost improvement", () => {
  const comparison = selectComfortRouteComparison({
    candidates: [
      candidate("fast", 8, 800, 100, true),
      candidate("tiny", 9, 860, 99, true),
    ],
  });

  assert.equal(comparison.comfort.id, "fast");
});

test("faster and more comfortable candidate can be both fastest and comfort", () => {
  const comparison = selectComfortRouteComparison({
    candidates: [
      candidate("slower", 10, 900, 75, true),
      candidate("best", 8, 760, 50, true),
    ],
  });

  assert.equal(comparison.fastest.id, "best");
  assert.equal(comparison.comfort.id, "best");
  assert.equal(comparison.fastest.role, "fastest-and-comfort");
});

function candidate(
  id: string,
  durationMinutes: number,
  distanceMeters: number,
  environmentalCost: number,
  comparable: boolean,
): Omit<AnalyzedRouteCandidate, "role" | "metrics"> {
  return {
    id,
    route: {
      id,
      sourceRouteIndex: 0,
      durationSeconds: durationMinutes * 60,
      distanceMeters,
      geometry: {
        type: "LineString",
        coordinates: [
          [-93.27, 44.98],
          [-93.26, 44.99],
        ],
      },
    } satisfies RouteCandidate,
    status: comparable ? "complete" : "partial",
    routeOverlapRatio: 0,
    comfortAnalysis: {
      routeComfortCost: {
        environmentalExposureCost: environmentalCost,
        averageEnvironmentalCost: environmentalCost / durationMinutes,
        analyzedDurationMinutes: durationMinutes,
        confidence: comparable ? 0.8 : 0.4,
        completeness: comparable ? 1 : 0.5,
        comparable,
      },
      summary: {
        comfortScore: comparable ? Math.round(100 - environmentalCost / 2) : null,
      },
    } as ComfortAnalysisResult,
  };
}
