import assert from "node:assert/strict";
import test from "node:test";
import { inferCoveredFeatureSemantics } from "@/lib/environment/coveredFeatures/semantics";
import { analyzeRouteCoverMetrics } from "@/lib/environment/coveredFeatures/routeCoverMetrics";
import type { CoveredFeature } from "@/lib/environment/coveredFeatures/types";

test("covered feature semantics classify building passages separately from indoor corridors", () => {
  const passage = inferCoveredFeatureSemantics({
    highway: "footway",
    tunnel: "building_passage",
  });
  const indoorUnknown = inferCoveredFeatureSemantics({
    highway: "corridor",
    indoor: "yes",
  });
  const indoorPublic = inferCoveredFeatureSemantics({
    highway: "corridor",
    indoor: "yes",
    access: "yes",
  });

  assert.equal(passage.eligible, true);
  assert.equal(passage.kind, "building-passage");
  assert.equal(indoorUnknown.eligible, false);
  assert.equal(indoorPublic.eligible, true);
  assert.equal(indoorPublic.kind, "indoor-public-connector");
});

test("covered feature semantics reject covered car infrastructure without pedestrian evidence", () => {
  const semantics = inferCoveredFeatureSemantics({
    highway: "motorway",
    covered: "yes",
  });

  assert.equal(semantics.eligible, false);
  assert.equal(semantics.confidence, 0);
});

test("route cover metrics report continuous covered runs without double counting overlap", () => {
  const route = {
    type: "LineString" as const,
    coordinates: [
      [-122.34, 47.61],
      [-122.34, 47.6109],
    ],
  };
  const metrics = analyzeRouteCoverMetrics(route, [coverLine(0, 45), coverLine(20, 70)]);

  assert.ok(metrics.coveredMeters > 55);
  assert.ok(metrics.coveredMeters < 85);
  assert.equal(metrics.coveredSegmentCount, 1);
  assert.ok(metrics.longestContinuousCoveredMeters > 55);
});

function coverLine(startMeters: number, endMeters: number): CoveredFeature {
  const metersToLat = 1 / 111_320;
  return {
    id: `cover-${startMeters}-${endMeters}`,
    geometry: {
      type: "LineString",
      coordinates: [
        [-122.34, 47.61 + startMeters * metersToLat],
        [-122.34, 47.61 + endMeters * metersToLat],
      ],
    },
    kind: "roofed-walkway",
    source: "test",
    confidence: 1,
    access: "public",
    accessConfidence: 1,
    evidence: {
      source: "test",
      kind: "roofed-walkway",
      confidence: 1,
      access: "public",
      accessConfidence: 1,
    },
  };
}
