import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateLabel,
  formatCoveredDistance,
  formatDistance,
  formatDuration,
  formatPercent,
  routeExplanation,
} from "./presentation";
import type { ComfortComparison, RouteCandidate } from "../types";

test("formats stable mobile route values", () => {
  assert.equal(formatDuration(601), "10 min");
  assert.equal(formatDistance(1609.344), "1.0 mi");
  assert.equal(formatPercent(0.824), "82%");
});

test("maps engine context to consumer labels", () => {
  assert.equal(candidateLabel("balanced"), "Comfiest");
  assert.equal(candidateLabel("rain"), "Stay Dry");
  assert.equal(candidateLabel("snow"), "Snow Comfort");
  assert.equal(candidateLabel("heat"), "Stay Cool");
});

test("uses raw environmental reduction for the primary explanation", () => {
  const candidate = routeCandidate({
    role: "comfort",
    environmentalCostReductionRatio: 0.274,
  });
  const comparison = {
    fastest: routeCandidate({ role: "fastest" }),
    comfort: candidate,
    candidates: [candidate],
    debug: { context: { context: "heat", routeLabel: "Stay Cool", reason: "Hot" } },
  } satisfies ComfortComparison;

  assert.equal(routeExplanation(candidate, comparison), "27% lower environmental exposure");
});

test("does not present missing cover data as a measured zero", () => {
  const candidate = routeCandidate({ role: "comfort" });
  candidate.rainAnalysis = {
    summary: { averageRainExposure: 1, coveredMeters: 0 },
  };

  assert.equal(formatCoveredDistance(candidate, "unavailable"), "Unavailable");
  assert.equal(formatCoveredDistance(candidate, "partial"), "0 m (limited)");
  assert.equal(formatCoveredDistance(candidate, "ready"), "0 m");
});

function routeCandidate({
  role,
  environmentalCostReductionRatio = 0,
}: {
  role: RouteCandidate["role"];
  environmentalCostReductionRatio?: number;
}): RouteCandidate {
  return {
    id: role,
    role,
    status: "complete",
    route: {
      durationSeconds: 600,
      distanceMeters: 1000,
      geometry: { type: "LineString", coordinates: [[-93.2, 44.9], [-93.1, 45]] },
    },
    metrics: { extraDurationSeconds: 0, environmentalCostReductionRatio },
  };
}
