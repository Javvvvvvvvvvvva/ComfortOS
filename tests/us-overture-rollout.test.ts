import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import buildProgress from "@/config/data-regions/build-progress/overture-2026-08-19.0.json";
import { auditBuildProgress } from "@/scripts/audit-us-overture-build-progress";
import { selectStatePartitions } from "@/scripts/build-us-state-overture-buildings";
import {
  selectRolloutPartitions,
  type RolloutPlan,
} from "@/scripts/build-us-overture-rollout";

test("state resume selects the next incomplete partitions", () => {
  const plan = {
    format: "comfortos-us-state-building-plan-v1" as const,
    jurisdiction: { code: "RI", name: "Rhode Island" },
    partitionCount: 3,
    partitions: [
      { id: "first", configPath: "first.json" },
      { id: "second", configPath: "second.json" },
      { id: "third", configPath: "third.json" },
    ],
  };

  const selected = selectStatePartitions(plan, {
    maximum: 2,
    resume: true,
    completedPartitionIds: new Set(["first"]),
  });

  assert.deepEqual(
    selected.map((partition) => partition.id),
    ["second", "third"],
  );
});

test("nationwide rollout orders pending work by smallest jurisdiction", async () => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "comfortos-rollout-"));
  const plans: RolloutPlan[] = [
    rolloutPlan("RI", "Rhode Island", ["ri-1", "ri-2"]),
    rolloutPlan("DC", "District of Columbia", ["dc-1"]),
  ];
  await fs.mkdir(path.join(dataRoot, "dc", "release", "dc-1"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(dataRoot, "dc", "release", "dc-1", "manifest.json"),
    "{}",
  );

  const selected = selectRolloutPartitions(plans, dataRoot, "release", 1);

  assert.equal(selected.length, 1);
  assert.equal(selected[0].code, "RI");
  assert.equal(selected[0].partitionId, "ri-1");
});

test("nationwide rollout skips remotely archived jurisdictions", () => {
  const plans: RolloutPlan[] = [
    rolloutPlan("DC", "District of Columbia", ["dc-1"]),
    rolloutPlan("RI", "Rhode Island", ["ri-1"]),
  ];

  const selected = selectRolloutPartitions(
    plans,
    "/missing-local-data",
    "release",
    1,
    new Set(["DC"]),
  );

  assert.equal(selected.length, 1);
  assert.equal(selected[0].code, "RI");
});

test("nationwide audit preserves remotely archived progress after local pruning", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "comfortos-audit-"));
  const planRoot = path.join(root, "plans");
  const dataRoot = path.join(root, "data");
  const checkpointRoot = path.join(root, "checkpoints");
  await fs.mkdir(path.join(planRoot, "dc"), { recursive: true });
  await fs.mkdir(path.join(checkpointRoot, "release"), { recursive: true });
  await fs.writeFile(
    path.join(planRoot, "dc", "state-plan.json"),
    JSON.stringify({
      format: "comfortos-us-state-building-plan-v1",
      jurisdiction: { code: "DC", name: "District of Columbia" },
      partitionCount: 1,
      partitions: [{ id: "dc-1", bbox: [-77.25, 38.75, -77, 39] }],
    }),
  );
  await fs.writeFile(
    path.join(checkpointRoot, "release", "dc.json"),
    JSON.stringify({
      format: "comfortos-us-state-archive-checkpoint-v1",
      release: "release",
      jurisdiction: { code: "DC", name: "District of Columbia" },
      dataset: {
        buildingCount: 10,
        usableHeightCount: 8,
        usableHeightRatio: 0.8,
      },
      archive: {
        partitionCount: 1,
        storedBytes: 100,
        remoteVerified: true,
      },
      localDataPruned: true,
    }),
  );

  const report = await auditBuildProgress(
    planRoot,
    dataRoot,
    "release",
    checkpointRoot,
  );

  assert.equal(report.summary.completedJurisdictionCount, 1);
  assert.equal(report.summary.archivedJurisdictionCount, 1);
  assert.equal(report.summary.archivedPartitionCount, 1);
  assert.equal(report.jurisdictions[0].status, "archived");
  assert.equal(report.jurisdictions[0].buildingCount, 10);
});

test("checked-in nationwide build progress is internally consistent", () => {
  const completedPartitions = buildProgress.jurisdictions.reduce(
    (total, jurisdiction) => total + jurisdiction.completedPartitionCount,
    0,
  );
  const completedJurisdictions = buildProgress.jurisdictions.filter(
    (jurisdiction) =>
      jurisdiction.status === "built" || jurisdiction.status === "archived",
  ).length;

  assert.equal(buildProgress.summary.jurisdictionCount, 51);
  assert.equal(
    buildProgress.summary.plannedPartitionCount,
    buildProgress.summary.uniqueGridCellCount +
      buildProgress.summary.duplicateStateAssignmentCount,
  );
  assert.equal(buildProgress.summary.completedPartitionCount, completedPartitions);
  assert.equal(
    buildProgress.summary.completedJurisdictionCount,
    completedJurisdictions,
  );
  assert.equal(buildProgress.summary.invalidPartitionCount, 0);
  assert.equal(buildProgress.summary.archivedJurisdictionCount, 0);
  assert.equal(buildProgress.summary.archivedPartitionCount, 0);
});

function rolloutPlan(code: string, name: string, ids: string[]): RolloutPlan {
  return {
    planPath: `/plans/${code.toLowerCase()}/state-plan.json`,
    jurisdiction: { code, name },
    partitionCount: ids.length,
    partitions: ids.map((id) => ({ id })),
  };
}
