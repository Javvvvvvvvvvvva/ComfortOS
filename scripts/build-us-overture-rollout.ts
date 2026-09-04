import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type RolloutPlan = {
  planPath: string;
  jurisdiction: { code: string; name: string };
  partitionCount: number;
  partitions: Array<{ id: string }>;
};

export type RolloutPartition = {
  code: string;
  name: string;
  planPath: string;
  partitionCount: number;
  partitionId: string;
};

function main() {
  const options = parseArgs(process.argv.slice(2));
  const planRoot = path.resolve(requireOption(options.planRoot, "--plan-root"));
  const dataRoot = path.resolve(requireOption(options.dataRoot, "--data-root"));
  const release = requireOption(options.release, "--release");
  if (release === "latest") {
    throw new Error("--release must be pinned and cannot be 'latest'.");
  }
  const maximum = positiveInteger(
    requireOption(options.maxPartitions, "--max-partitions"),
    "--max-partitions",
  );
  const minimumFreeBytes =
    options.minimumFreeBytes ?? String(8 * 1024 * 1024 * 1024);
  if (!/^\d+$/.test(minimumFreeBytes)) {
    throw new Error("--minimum-free-bytes must be a non-negative integer.");
  }
  const { allPlans, selectedPlans: plans } = loadRolloutPlanSets(
    planRoot,
    options.states ?? "all",
  );
  const archiveCheckpointRoot = path.resolve(
    options.archiveCheckpointRoot ?? "config/data-regions/archive-checkpoints",
  );
  const archivedJurisdictions = loadArchivedJurisdictionCodes(
    archiveCheckpointRoot,
    release,
    allPlans,
  );
  const selected = selectRolloutPartitions(
    plans,
    dataRoot,
    release,
    maximum,
    archivedJurisdictions,
  );
  const dryRun = options.dryRun === "true";
  let built = 0;

  for (const partition of selected) {
    if (dryRun) continue;
    const outputRoot = path.join(
      dataRoot,
      partition.code.toLowerCase(),
      release,
    );
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/build-us-state-overture-buildings.ts",
        "--plan",
        partition.planPath,
        "--partition-id",
        partition.partitionId,
        "--max-partitions",
        "1",
        "--output-root",
        outputRoot,
        "--release",
        release,
        "--resume",
        "true",
        "--minimum-free-bytes",
        minimumFreeBytes,
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      throw new Error(
        `Nationwide rollout stopped at ${partition.code}/${partition.partitionId}.`,
      );
    }
    built += 1;
  }

  console.log(
    JSON.stringify(
      {
        release,
        dryRun,
        selected: selected.length,
        built,
        minimumFreeBytes,
        archivedJurisdictions: [...archivedJurisdictions].sort(),
        order: "smallest-jurisdiction-first",
        partitions: selected,
      },
      null,
      2,
    ),
  );
}

export function loadPlans(planRoot: string, states: string) {
  const requested =
    states.toLowerCase() === "all"
      ? null
      : new Set(
          states
            .split(",")
            .map((code) => code.trim().toUpperCase())
            .filter(Boolean),
        );
  const plans = fs
    .readdirSync(planRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const planPath = path.join(planRoot, entry.name, "state-plan.json");
      if (!fs.existsSync(planPath)) return [];
      const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as Omit<
        RolloutPlan,
        "planPath"
      > & { format?: string };
      if (plan.format !== "comfortos-us-state-building-plan-v1") {
        throw new Error(`Unsupported state plan: ${planPath}`);
      }
      return [{ ...plan, planPath }];
    })
    .filter((plan) => !requested || requested.has(plan.jurisdiction.code));

  if (requested) {
    const found = new Set(plans.map((plan) => plan.jurisdiction.code));
    const missing = [...requested].filter((code) => !found.has(code));
    if (missing.length) throw new Error(`Missing state plans: ${missing.join(", ")}.`);
  }
  return plans;
}

export function loadRolloutPlanSets(planRoot: string, states: string) {
  const allPlans = loadPlans(planRoot, "all");
  const selectedPlans =
    states.toLowerCase() === "all" ? allPlans : loadPlans(planRoot, states);
  return { allPlans, selectedPlans };
}

export function selectRolloutPartitions(
  plans: RolloutPlan[],
  dataRoot: string,
  release: string,
  maximum: number,
  archivedJurisdictions = new Set<string>(),
) {
  return plans
    .sort(
      (left, right) =>
        left.partitionCount - right.partitionCount ||
        left.jurisdiction.code.localeCompare(right.jurisdiction.code),
    )
    .filter((plan) => !archivedJurisdictions.has(plan.jurisdiction.code))
    .flatMap((plan): RolloutPartition[] =>
      plan.partitions.flatMap((partition) => {
        const manifestPath = path.join(
          dataRoot,
          plan.jurisdiction.code.toLowerCase(),
          release,
          partition.id,
          "manifest.json",
        );
        if (fs.existsSync(manifestPath)) return [];
        return [
          {
            code: plan.jurisdiction.code,
            name: plan.jurisdiction.name,
            planPath: plan.planPath,
            partitionCount: plan.partitionCount,
            partitionId: partition.id,
          },
        ];
      }),
    )
    .slice(0, maximum);
}

export function loadArchivedJurisdictionCodes(
  checkpointRoot: string,
  release: string,
  plans: RolloutPlan[] = [],
) {
  const releaseRoot = path.join(checkpointRoot, release);
  if (!fs.existsSync(releaseRoot)) return new Set<string>();
  const archived = new Set<string>();
  for (const entry of fs.readdirSync(releaseRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const checkpoint = JSON.parse(
      fs.readFileSync(path.join(releaseRoot, entry.name), "utf8"),
    ) as {
      format?: string;
      release?: string;
      jurisdiction?: { code?: string };
      archive?: { remoteVerified?: boolean; partitionCount?: number };
    };
    if (
      checkpoint.format !== "comfortos-us-state-archive-checkpoint-v1" ||
      checkpoint.release !== release ||
      checkpoint.archive?.remoteVerified !== true ||
      !Number.isInteger(checkpoint.archive?.partitionCount) ||
      !checkpoint.jurisdiction?.code
    ) {
      throw new Error(`Invalid archive checkpoint: ${entry.name}`);
    }
    const plan = plans.find(
      (candidate) => candidate.jurisdiction.code === checkpoint.jurisdiction?.code,
    );
    if (
      plans.length > 0 &&
      (!plan || plan.partitionCount !== checkpoint.archive.partitionCount)
    ) {
      throw new Error(`Archive checkpoint does not match its state plan: ${entry.name}`);
    }
    archived.add(checkpoint.jurisdiction.code);
  }
  return archived;
}

function positiveInteger(value: string, name: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
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

if (process.argv[1]?.endsWith("build-us-overture-rollout.ts")) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
