import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  buildNationwideWeatherReport,
  loadNationwideWeatherScenarios,
  type NationwideWeatherRow,
} from "@/scripts/validate-nationwide-weather";

test("nationwide weather validation maps one in-state route fixture to every jurisdiction", async () => {
  const scenarios = await loadNationwideWeatherScenarios(
    path.resolve("fixtures/routes"),
  );

  assert.equal(scenarios.length, 51);
  assert.equal(new Set(scenarios.map((scenario) => scenario.code)).size, 51);
  assert.equal(new Set(scenarios.map((scenario) => scenario.fixtureId)).size, 51);
  assert.ok(scenarios.every((scenario) => Number.isFinite(scenario.coordinate.latitude)));
  assert.ok(scenarios.every((scenario) => Number.isFinite(scenario.coordinate.longitude)));
  assert.ok(scenarios.every((scenario) => Number.isFinite(scenario.destination.latitude)));
});

test("nationwide weather acceptance requires all 51 jurisdictions to pass", () => {
  const rows = Array.from({ length: 51 }, (_, index) =>
    row({ code: String(index).padStart(2, "0"), passed: true }),
  );
  const accepted = buildNationwideWeatherReport(rows, "2026-09-13T12:00:00.000Z");
  const failed = buildNationwideWeatherReport(
    rows.map((value, index) =>
      index === 8
        ? { ...value, passed: false, failures: ["nearTermSnowfallCoverage"] }
        : value,
    ),
    "2026-09-13T12:00:00.000Z",
  );

  assert.equal(accepted.summary.accepted, true);
  assert.equal(failed.summary.accepted, false);
  assert.equal(failed.summary.failedCount, 1);
});

function row({ code, passed }: { code: string; passed: boolean }): NationwideWeatherRow {
  return {
    code,
    state: code,
    fixtureId: code,
    label: code,
    coordinate: { latitude: 40, longitude: -90 },
    passed,
    attempts: 1,
    elapsedMs: 1,
    forecastPointCount: 156,
    selectionMethod: "current",
    weatherContext: "balanced",
    precipitationType: "none",
    selectedSnowfallMmPerHour: 0,
    selectedIceAccumulationMmPerHour: 0,
    nearTermSnowfallCoverage: 1,
    nearTermIceAccumulationCoverage: 1,
    nearTermPrecipitationTypeCoverage: 1,
    nearTermUsableWindVectorCoverage: 1,
    snowfallCoverage: 1,
    iceAccumulationCoverage: 1,
    precipitationTypeCoverage: 1,
    checks: {},
    failures: passed ? [] : ["fixture"],
  };
}
