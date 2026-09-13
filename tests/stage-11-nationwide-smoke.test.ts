import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateNationwideAppSmoke,
  type NationwideSmokeRow,
} from "@/scripts/smoke-stage-11-nationwide";

function row(id: string): NationwideSmokeRow {
  return {
    id,
    jurisdiction: "XX",
    success: true,
    status: 200,
    elapsedMs: 100,
    candidateCount: 2,
    comparableCandidateCount: 2,
    buildingQuerySucceeded: true,
    buildingRegion: "us-xx-w0000-n0000",
    buildingDatasetVersion: "2026-08-19.0",
    buildingCapability: "ready",
    routingProvider: "mapbox-directions-walking",
    routingMode: "managed",
    routingProductionEligible: true,
    managedRoutingRequests: 3,
  };
}

const ids = [
  "minneapolis",
  "seattle",
  "phoenix",
  "chicago",
  "new-york",
  "miami",
  "anchorage",
  "honolulu",
  "washington-dc",
];

const health = {
  status: "ready",
  checks: {
    routing: { ok: true, mode: "mapbox-managed" },
    buildings: { ok: true, mode: "http-overture" },
  },
};

test("nationwide app smoke accepts nine managed-routing regions", () => {
  const result = evaluateNationwideAppSmoke({
    healthStatus: 200,
    healthBody: health,
    expectedRelease: "2026-08-19.0",
    rows: ids.map(row),
  });
  assert.deepEqual(result, { accepted: true, failures: [] });
});

test("nationwide app smoke rejects unsupported or stale building coverage", () => {
  const rows = ids.map(row);
  rows[3] = {
    ...rows[3],
    buildingRegion: "unsupported",
    buildingDatasetVersion: "stale-release",
  };
  const result = evaluateNationwideAppSmoke({
    healthStatus: 200,
    healthBody: health,
    expectedRelease: "2026-08-19.0",
    rows,
  });
  assert.equal(result.accepted, false);
  assert.match(result.failures.join("\n"), /chicago: building coverage is unavailable/);
  assert.match(result.failures.join("\n"), /chicago: building release does not match/);
});
