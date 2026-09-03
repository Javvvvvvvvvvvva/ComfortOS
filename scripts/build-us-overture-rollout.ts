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
  const plans = loadPlans(planRoot, options.states ?? "all");
  const selected = selectRolloutPartitions(plans, dataRoot, release, maximum);
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

export function selectRolloutPartitions(
  plans: RolloutPlan[],
  dataRoot: string,
  release: string,
  maximum: number,
) {
  return plans
    .sort(
      (left, right) =>
        left.partitionCount - right.partitionCount ||
        left.jurisdiction.code.localeCompare(right.jurisdiction.code),
    )
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
