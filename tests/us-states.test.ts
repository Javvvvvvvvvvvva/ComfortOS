import assert from "node:assert/strict";
import test from "node:test";
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
    ["AZ", "MN", "WA"],
  );
  assert.equal(findUsJurisdiction("IL")?.validationRegions.length, 0);
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
