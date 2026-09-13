import assert from "node:assert/strict";
import test from "node:test";
import { percentile } from "@/scripts/benchmark-environment-deployment";

test("environment deployment percentiles use the nearest-rank method", () => {
  assert.equal(percentile([], 0.95), 0);
  assert.equal(percentile([40, 10, 20, 30], 0.5), 20);
  assert.equal(percentile([40, 10, 20, 30], 0.95), 40);
});
