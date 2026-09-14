import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parseEnvironmentSourceCatalog } from "@/lib/environment/sources/catalog";

test("checked-in environment source catalog pins versions and claim boundaries", () => {
  const catalog = parseEnvironmentSourceCatalog(
    JSON.parse(
      fs.readFileSync(
        "config/data-sources/environment-layers-v1.json",
        "utf8",
      ),
    ),
  );

  assert.equal(catalog.sources.length, 6);
  assert.ok(catalog.sources.every((source) => source.version !== "latest"));
  assert.ok(catalog.sources.every((source) => source.prohibitedClaims.length > 0));
  assert.equal(
    catalog.sources.find((source) => source.layer === "tree-canopy")
      ?.spatialResolutionMeters?.nominal,
    30,
  );
});

test("environment source catalog rejects duplicate and unpinned entries", () => {
  const source = validSource();
  assert.throws(
    () =>
      parseEnvironmentSourceCatalog({
        format: "comfortos-environment-source-catalog-v1",
        updatedAt: "2026-09-13T00:00:00.000Z",
        sources: [source, source],
      }),
    /Duplicate environment source id/,
  );
  assert.throws(
    () =>
      parseEnvironmentSourceCatalog({
        format: "comfortos-environment-source-catalog-v1",
        updatedAt: "2026-09-13T00:00:00.000Z",
        sources: [{ ...source, version: "latest" }],
      }),
    /Invalid environment source entry/,
  );
});

function validSource() {
  return {
    id: "test-source-2026",
    layer: "terrain-elevation",
    authority: "Test authority",
    dataset: "Test dataset",
    version: "2026.1",
    dataAsOf: "2026-09-01",
    coverage: ["test"],
    spatialResolutionMeters: { nominal: 10 },
    updateCadence: "annual",
    freshnessPolicyDays: 365,
    license: { name: "Test", url: "https://example.com/license" },
    access: { method: "official-download", url: "https://example.com/data" },
    activation: "pilot",
    qualitySignals: ["resolution"],
    intendedUses: ["testing"],
    prohibitedClaims: ["production"],
  };
}
