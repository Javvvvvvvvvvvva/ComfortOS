import assert from "node:assert/strict";
import test from "node:test";
import chicagoPilot from "@/config/data-regions/deployments/illinois-chicago-pilot.json";
import {
  findUsJurisdiction,
  getUsStateCatalog,
  listUsJurisdictionCoverage,
} from "@/lib/regions/usStates";

const EXPECTED_JURISDICTION_CODES = [
  "AK", "AL", "AR", "AZ", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI",
  "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN",
  "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA",
  "WI", "WV", "WY",
];

test("United States catalog contains 50 states and the District of Columbia", () => {
  const catalog = getUsStateCatalog();
  assert.equal(catalog.jurisdictions.length, 51);
  assert.equal(new Set(catalog.jurisdictions.map((state) => state.code)).size, 51);
  assert.equal(new Set(catalog.jurisdictions.map((state) => state.fips)).size, 51);
  assert.deepEqual(
    catalog.jurisdictions.map((state) => state.code).sort(),
    EXPECTED_JURISDICTION_CODES,
  );
  assert.equal(findUsJurisdiction("DC")?.name, "District of Columbia");
  assert.equal(findUsJurisdiction("06")?.name, "California");
});

test("nationwide eligibility remains separate from deployed Comfort data", () => {
  const coverage = listUsJurisdictionCoverage();
  assert.ok(coverage.every((state) => state.baselineEligibility.walkingRouting));
  assert.ok(coverage.every((state) => state.baselineEligibility.nwsWeather));
  assert.deepEqual(
    coverage
      .filter((state) => state.environmentalData === "validated-metro")
      .map((state) => state.code)
      .sort(),
    ["AZ", "IL", "MN", "WA"],
  );
  assert.deepEqual(findUsJurisdiction("IL")?.validationRegions, [
    {
      id: "chicago",
      label: "Chicago",
      profiles: ["heat", "shade", "wind"],
    },
  ]);
});

test("state catalog records official source and finite planning bounds", () => {
  const catalog = getUsStateCatalog();
  assert.equal(catalog.source.publisher, "United States Census Bureau");
  assert.match(catalog.source.url, /census\.gov/);
  for (const state of catalog.jurisdictions) {
    assert.equal(state.bbox.length, 4);
    assert.ok(state.bbox.every(Number.isFinite));
    assert.ok(state.landAreaSquareMeters > 0);
  }
});

test("Chicago rollout is recorded as metro staging rather than statewide production", () => {
  assert.equal(chicagoPilot.status, "staging-validated");
  assert.equal(chicagoPilot.jurisdiction.code, "IL");
  assert.equal(chicagoPilot.region.id, "us-il-w0351-n0167");
  assert.equal(chicagoPilot.dataset.release, "2026-08-19.0");
  assert.equal(chicagoPilot.dataset.buildingCount, 450_693);
  assert.equal(chicagoPilot.randomAccess.recordCount, 450_693);
  assert.equal(chicagoPilot.validation.successfulRouteCount, 6);
  assert.equal(chicagoPilot.productionDeployment.status, "not-configured");
});
