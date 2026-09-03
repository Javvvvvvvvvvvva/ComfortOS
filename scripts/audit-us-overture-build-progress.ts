import fs from "node:fs/promises";
import path from "node:path";
import type { LocalOvertureStoreManifest } from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";

type StatePlan = {
  format: "comfortos-us-state-building-plan-v1";
  jurisdiction: { code: string; name: string };
  partitionCount: number;
  partitions: Array<{ id: string; bbox: [number, number, number, number] }>;
};

type StateArchiveCheckpoint = {
  format: "comfortos-us-state-archive-checkpoint-v1";
  release: string;
  jurisdiction: { code: string; name: string };
  dataset: {
    buildingCount: number;
    usableHeightCount: number;
    usableHeightRatio: number | null;
  };
  archive: {
    partitionCount: number;
    storedBytes: number;
    remoteVerified: boolean;
  };
  localDataPruned: boolean;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const planRoot = path.resolve(requireOption(options.planRoot, "--plan-root"));
  const dataRoot = path.resolve(requireOption(options.dataRoot, "--data-root"));
  const release = requireOption(options.release, "--release");
  const archiveCheckpointRoot = path.resolve(
    options.archiveCheckpointRoot ?? "config/data-regions/archive-checkpoints",
  );
  const report = await auditBuildProgress(
    planRoot,
    dataRoot,
    release,
    archiveCheckpointRoot,
  );
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    await fs.mkdir(path.dirname(options.output), { recursive: true });
    await fs.writeFile(options.output, text, "utf8");
  }
  console.log(text);
  if (report.summary.invalidPartitionCount > 0) process.exitCode = 1;
}

export async function auditBuildProgress(
  planRoot: string,
  dataRoot: string,
  release: string,
  archiveCheckpointRoot?: string,
) {
  const plans = await loadStatePlans(planRoot);
  const archiveCheckpoints = archiveCheckpointRoot
    ? await loadArchiveCheckpoints(archiveCheckpointRoot, release)
    : new Map<string, StateArchiveCheckpoint>();
  const plannedCodes = new Set(plans.map((plan) => plan.jurisdiction.code));
  const unknownArchivedCodes = [...archiveCheckpoints.keys()].filter(
    (code) => !plannedCodes.has(code),
  );
  if (unknownArchivedCodes.length) {
    throw new Error(
      `Archive checkpoints have no matching state plan: ${unknownArchivedCodes.join(", ")}.`,
    );
  }
  const uniqueCells = new Set<string>();
  const jurisdictions = [];
  let completedPartitionCount = 0;
  let invalidPartitionCount = 0;
  let buildingCount = 0;
  let usableHeightCount = 0;
  let storedBytes = 0;
  let archivedPartitionCount = 0;

  for (const plan of plans) {
    for (const partition of plan.partitions) uniqueCells.add(partition.bbox.join(","));
    const archiveCheckpoint = archiveCheckpoints.get(plan.jurisdiction.code);
    if (archiveCheckpoint) {
      if (archiveCheckpoint.archive.partitionCount !== plan.partitionCount) {
        throw new Error(
          `Archive checkpoint partition count mismatch: ${plan.jurisdiction.code}.`,
        );
      }
      completedPartitionCount += plan.partitionCount;
      archivedPartitionCount += plan.partitionCount;
      buildingCount += archiveCheckpoint.dataset.buildingCount;
      usableHeightCount += archiveCheckpoint.dataset.usableHeightCount;
      storedBytes += archiveCheckpoint.archive.storedBytes;
      jurisdictions.push({
        code: plan.jurisdiction.code,
        name: plan.jurisdiction.name,
        status: "archived",
        plannedPartitionCount: plan.partitionCount,
        completedPartitionCount: plan.partitionCount,
        invalidPartitionCount: 0,
        buildingCount: archiveCheckpoint.dataset.buildingCount,
        usableHeightRatio: archiveCheckpoint.dataset.usableHeightRatio,
        storedBytes: archiveCheckpoint.archive.storedBytes,
        localDataPruned: archiveCheckpoint.localDataPruned,
      });
      continue;
    }
    let completed = 0;
    let invalid = 0;
    let stateBuildings = 0;
    let stateUsableHeights = 0;
    let stateBytes = 0;
    for (const partition of plan.partitions) {
      const storeDir = path.join(
        dataRoot,
        plan.jurisdiction.code.toLowerCase(),
        release,
        partition.id,
      );
      let manifest: LocalOvertureStoreManifest;
      try {
        manifest = JSON.parse(
          await fs.readFile(path.join(storeDir, "manifest.json"), "utf8"),
        ) as LocalOvertureStoreManifest;
      } catch (error) {
        if (isMissingFile(error)) continue;
        invalid += 1;
        continue;
      }
      try {
        const offsetFile = manifest.randomAccessIndex?.file;
        const [buildingStats, tileIndexStats, offsetStats] = await Promise.all([
          fs.stat(path.join(storeDir, "buildings.jsonl")),
          fs.stat(path.join(storeDir, "tile-index.json")),
          offsetFile
            ? fs.stat(path.join(storeDir, offsetFile))
            : Promise.resolve(null),
        ]);
        const valid =
          manifest.format === "comfortos-local-building-store-v1" &&
          manifest.region === partition.id &&
          manifest.release === release &&
          manifest.randomAccessIndex?.recordSizeBytes === 12 &&
          offsetStats?.size === manifest.buildingCount * 12 &&
          buildingStats.isFile() &&
          tileIndexStats.isFile() &&
          Boolean(manifest.checksums?.buildingsSha256) &&
          Boolean(manifest.checksums?.tileIndexSha256) &&
          Boolean(manifest.checksums?.buildingOffsetsSha256) &&
          sameBounds(manifest.bbox, partition.bbox);
        if (!valid) {
          invalid += 1;
          continue;
        }
      } catch {
        invalid += 1;
        continue;
      }
      completed += 1;
      stateBuildings += manifest.buildingCount;
      stateUsableHeights +=
        manifest.explicitHeightCount + manifest.floorDerivedHeightCount;
      stateBytes += await directorySize(storeDir);
    }
    completedPartitionCount += completed;
    invalidPartitionCount += invalid;
    buildingCount += stateBuildings;
    usableHeightCount += stateUsableHeights;
    storedBytes += stateBytes;
    jurisdictions.push({
      code: plan.jurisdiction.code,
      name: plan.jurisdiction.name,
      status:
        invalid > 0
          ? "invalid"
          : completed === plan.partitionCount
            ? "built"
            : completed > 0
              ? "in-progress"
              : "pending",
      plannedPartitionCount: plan.partitionCount,
      completedPartitionCount: completed,
      invalidPartitionCount: invalid,
      buildingCount: stateBuildings,
      usableHeightRatio:
        stateBuildings > 0 ? stateUsableHeights / stateBuildings : null,
      storedBytes: stateBytes,
    });
  }

  const plannedPartitionCount = plans.reduce(
    (total, plan) => total + plan.partitionCount,
    0,
  );
  return {
    format: "comfortos-us-overture-build-progress-v1",
    generatedAt: new Date().toISOString(),
    release,
    summary: {
      jurisdictionCount: plans.length,
      completedJurisdictionCount: jurisdictions.filter(
        (jurisdiction) =>
          jurisdiction.status === "built" || jurisdiction.status === "archived",
      ).length,
      archivedJurisdictionCount: jurisdictions.filter(
        (jurisdiction) => jurisdiction.status === "archived",
      ).length,
      plannedPartitionCount,
      uniqueGridCellCount: uniqueCells.size,
      duplicateStateAssignmentCount: plannedPartitionCount - uniqueCells.size,
      completedPartitionCount,
      archivedPartitionCount,
      invalidPartitionCount,
      completionRatio:
        plannedPartitionCount > 0
          ? completedPartitionCount / plannedPartitionCount
          : 0,
      buildingCount,
      usableHeightRatio:
        buildingCount > 0 ? usableHeightCount / buildingCount : null,
      storedBytes,
    },
    jurisdictions,
  };
}

async function loadArchiveCheckpoints(root: string, release: string) {
  const releaseRoot = path.join(root, release);
  let entries;
  try {
    entries = await fs.readdir(releaseRoot, { withFileTypes: true });
  } catch (error) {
    if (isMissingFile(error)) return new Map<string, StateArchiveCheckpoint>();
    throw error;
  }
  const checkpoints = new Map<string, StateArchiveCheckpoint>();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const checkpoint = JSON.parse(
      await fs.readFile(path.join(releaseRoot, entry.name), "utf8"),
    ) as StateArchiveCheckpoint;
    if (
      checkpoint.format !== "comfortos-us-state-archive-checkpoint-v1" ||
      checkpoint.release !== release ||
      checkpoint.archive?.remoteVerified !== true ||
      !checkpoint.jurisdiction?.code ||
      !Number.isInteger(checkpoint.dataset?.buildingCount) ||
      checkpoint.dataset.buildingCount < 0 ||
      !Number.isInteger(checkpoint.dataset?.usableHeightCount) ||
      checkpoint.dataset.usableHeightCount < 0 ||
      checkpoint.dataset.usableHeightCount > checkpoint.dataset.buildingCount ||
      (checkpoint.dataset.usableHeightRatio !== null &&
        (!Number.isFinite(checkpoint.dataset.usableHeightRatio) ||
          checkpoint.dataset.usableHeightRatio < 0 ||
          checkpoint.dataset.usableHeightRatio > 1))
    ) {
      throw new Error(`Invalid archive checkpoint: ${entry.name}`);
    }
    if (checkpoints.has(checkpoint.jurisdiction.code)) {
      throw new Error(
        `Duplicate archive checkpoint: ${checkpoint.jurisdiction.code}.`,
      );
    }
    checkpoints.set(checkpoint.jurisdiction.code, checkpoint);
  }
  return checkpoints;
}

async function loadStatePlans(planRoot: string) {
  const entries = await fs.readdir(planRoot, { withFileTypes: true });
  const plans: StatePlan[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const plan = JSON.parse(
        await fs.readFile(path.join(planRoot, entry.name, "state-plan.json"), "utf8"),
      ) as StatePlan;
      if (plan.format !== "comfortos-us-state-building-plan-v1") {
        throw new Error(`Unsupported state plan: ${entry.name}.`);
      }
      plans.push(plan);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }
  return plans.sort((left, right) =>
    left.jurisdiction.code.localeCompare(right.jurisdiction.code),
  );
}

async function directorySize(directory: string) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    if (entry.isFile()) total += (await fs.stat(path.join(directory, entry.name))).size;
  }
  return total;
}

function sameBounds(
  left: [number, number, number, number] | undefined,
  right: [number, number, number, number],
) {
  return Boolean(left?.every((value, index) => value === right[index]));
}

function isMissingFile(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function parseArgs(args: string[]) {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    }
    options[key.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value;
  }
  return options;
}

function requireOption(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

if (process.argv[1]?.endsWith("audit-us-overture-build-progress.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
