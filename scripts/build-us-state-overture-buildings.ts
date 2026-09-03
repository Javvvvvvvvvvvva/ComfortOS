import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type StateBuildingPlan = {
  format: "comfortos-us-state-building-plan-v1";
  jurisdiction: { code: string; name: string };
  partitionCount: number;
  partitions: Array<{
    id: string;
    configPath: string;
  }>;
};

type PartitionSelectionOptions = {
  maximum: number;
  partitionId?: string;
  resume: boolean;
  completedPartitionIds: Set<string>;
};

function main() {
  const options = parseArgs(process.argv.slice(2));
  const planPath = requireOption(options.plan, "--plan");
  const maximum = Number(requireOption(options.maxPartitions, "--max-partitions"));
  if (!Number.isInteger(maximum) || maximum <= 0) {
    throw new Error("--max-partitions must be a positive integer.");
  }

  const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as StateBuildingPlan;
  if (plan.format !== "comfortos-us-state-building-plan-v1") {
    throw new Error("Unsupported state building plan.");
  }
  const planDir = path.dirname(planPath);
  const outputRoot = options.outputRoot ??
    path.join("/tmp", "comfortos-overture-us", plan.jurisdiction.code.toLowerCase());
  const release = options.release ?? "latest";
  const dryRun = options.dryRun === "true";
  const resume = options.resume === "true";
  const minimumFreeBytes = parseNonNegativeInteger(
    options.minimumFreeBytes,
    "--minimum-free-bytes",
  );
  const completedPartitionIds = new Set(
    plan.partitions
      .filter((partition) =>
        fs.existsSync(path.join(outputRoot, partition.id, "manifest.json")),
      )
      .map((partition) => partition.id),
  );
  const selected = selectStatePartitions(plan, {
    maximum,
    partitionId: options.partitionId,
    resume,
    completedPartitionIds,
  });
  if (options.partitionId && selected.length === 0) {
    throw new Error("No matching state partitions were selected.");
  }

  let built = 0;
  let skipped = 0;
  let planned = 0;
  for (const partition of selected) {
    const outputDir = path.join(outputRoot, partition.id);
    if (resume && completedPartitionIds.has(partition.id)) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      planned += 1;
      continue;
    }
    assertMinimumFreeBytes(outputRoot, minimumFreeBytes);
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/build-overture-buildings.ts",
        "--region",
        partition.id,
        "--region-config",
        path.resolve(planDir, partition.configPath),
        "--output",
        outputDir,
        "--release",
        release,
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      throw new Error(`Building partition failed: ${partition.id}`);
    }
    built += 1;
  }

  console.log(
    JSON.stringify(
      {
        jurisdiction: plan.jurisdiction,
        selected: selected.length,
        dryRun,
        planned,
        built,
        skipped,
        remaining: plan.partitions.filter(
          (partition) =>
            !fs.existsSync(
              path.join(outputRoot, partition.id, "manifest.json"),
            ),
        ).length,
        outputRoot,
        partitionIds: selected.map((partition) => partition.id),
      },
      null,
      2,
    ),
  );
}

export function selectStatePartitions(
  plan: StateBuildingPlan,
  options: PartitionSelectionOptions,
) {
  if (options.partitionId) {
    return plan.partitions.filter(
      (partition) => partition.id === options.partitionId,
    );
  }
  const candidates = options.resume
    ? plan.partitions.filter(
        (partition) => !options.completedPartitionIds.has(partition.id),
      )
    : plan.partitions;
  return candidates.slice(0, options.maximum);
}

function assertMinimumFreeBytes(outputRoot: string, minimumFreeBytes: bigint) {
  if (minimumFreeBytes === BigInt(0)) return;
  let existingPath = path.resolve(outputRoot);
  while (!fs.existsSync(existingPath)) {
    const parent = path.dirname(existingPath);
    if (parent === existingPath) break;
    existingPath = parent;
  }
  const stats = fs.statfsSync(existingPath);
  const availableBytes = BigInt(stats.bavail) * BigInt(stats.bsize);
  if (availableBytes < minimumFreeBytes) {
    throw new Error(
      `Building partition stopped: ${availableBytes} free bytes is below the required ${minimumFreeBytes}.`,
    );
  }
}

function parseNonNegativeInteger(value: string | undefined, name: string) {
  if (value === undefined) return BigInt(0);
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer.`);
  return BigInt(value);
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

if (process.argv[1]?.endsWith("build-us-state-overture-buildings.ts")) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
