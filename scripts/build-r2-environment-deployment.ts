import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { createR2ObjectStore } from "@/scripts/archive-us-state-overture";
import { activateEnvironmentRelease } from "@/scripts/activate-environment-release";
import { buildRemoteReleaseCatalog } from "@/scripts/restore-us-overture-release";

const DEFAULT_CHECKPOINT_ROOT = "config/data-regions/archive-checkpoints";
const DEFAULT_OUTPUT_ROOT = "deploy/cloudflare-environment/generated/deployment";
const DEFAULT_WRANGLER_CONFIG = "wrangler.environment-service.generated.jsonc";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvironment(args.envFile);
  const release = requireSafeId(args.release, "--release");
  const deploymentId = requireSafeId(args.deploymentId, "--deployment-id");
  if (args.confirmBuild !== deploymentId) {
    throw new Error(`--confirm-build must be exactly '${deploymentId}'.`);
  }
  const checkpointRoot = path.resolve(
    args.checkpointRoot ?? DEFAULT_CHECKPOINT_ROOT,
  );
  const targetRoot = path.resolve(args.outputRoot ?? DEFAULT_OUTPUT_ROOT);
  const states = await resolveStates(
    args.states ?? "all",
    checkpointRoot,
    release,
  );
  const accountId = requireEnvironment("R2_ACCOUNT_ID");
  const bucket = args.bucket ?? requireEnvironment("R2_BUCKET");
  const store = createR2ObjectStore({
    accountId,
    accessKeyId: requireEnvironment("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnvironment("R2_SECRET_ACCESS_KEY"),
    bucket,
  });
  const catalogResult = await buildRemoteReleaseCatalog(
    {
      release,
      states,
      checkpointRoot,
      targetRoot,
      prefix: normalizePrefix(args.prefix ?? "overture-buildings"),
    },
    store,
  );
  const activation = await activateEnvironmentRelease({
    targetRoot,
    release,
    deploymentId,
    requiredJurisdictionCount: parsePositiveInteger(
      args.requiredJurisdictionCount,
      51,
    ),
    confirmActivation: deploymentId,
    dryRun: false,
    verifiedRemoteCatalog: true,
  });
  await fs.rm(catalogResult.catalogPath);
  const wranglerConfigPath = path.resolve(
    args.wranglerConfig ?? DEFAULT_WRANGLER_CONFIG,
  );
  await writeJsonAtomic(wranglerConfigPath, {
    $schema: "node_modules/wrangler/config-schema.json",
    name: args.workerName ?? "comfortos-environment-staging",
    main: "deploy/cloudflare-environment/worker.ts",
    compatibility_date: "2026-08-28",
    compatibility_flags: ["nodejs_compat"],
    containers: [
      {
        class_name: "EnvironmentContainer",
        image: "./Dockerfile.environment-service-r2",
        max_instances: 1,
        instance_type: "standard-1",
      },
    ],
    durable_objects: {
      bindings: [
        {
          name: "ENVIRONMENT_CONTAINER",
          class_name: "EnvironmentContainer",
        },
      ],
    },
    migrations: [
      {
        tag: "v1",
        new_sqlite_classes: ["EnvironmentContainer"],
      },
    ],
    vars: {
      R2_ACCOUNT_ID: accountId,
      R2_BUCKET_NAME: bucket,
      ENVIRONMENT_RELEASE: release,
    },
    observability: {
      enabled: true,
      head_sampling_rate: 1,
    },
  });
  console.log(
    JSON.stringify(
      {
        mode: "r2-fuse-deployment-bundle",
        release,
        deploymentId,
        provider: store.provider,
        location: store.location,
        stateManifestCount: catalogResult.stateManifestCount,
        partitionManifestCount: catalogResult.partitionManifestCount,
        catalogSha256: catalogResult.catalogSha256,
        summary: catalogResult.catalog.summary,
        activeManifestPath: activation.activePath,
        wranglerConfigPath,
      },
      null,
      2,
    ),
  );
}

async function resolveStates(
  value: string,
  checkpointRoot: string,
  release: string,
) {
  if (value !== "all") {
    const states = Array.from(
      new Set(
        value
          .split(",")
          .map((state) => state.trim().toUpperCase())
          .filter(Boolean),
      ),
    ).sort();
    if (!states.length || states.some((state) => !/^[A-Z]{2}$/.test(state))) {
      throw new Error("--states must be 'all' or comma-separated state codes.");
    }
    return states;
  }
  const entries = await fs.readdir(path.join(checkpointRoot, release), {
    withFileTypes: true,
  });
  const states = entries
    .filter((entry) => entry.isFile() && /^[a-z]{2}\.json$/.test(entry.name))
    .map((entry) => entry.name.slice(0, 2).toUpperCase())
    .sort();
  if (states.length !== 51) {
    throw new Error(`--states all requires exactly 51 checkpoints; found ${states.length}.`);
  }
  return states;
}

async function loadEnvironment(explicitPath: string | undefined) {
  const envPath = path.resolve(explicitPath ?? ".env.local");
  try {
    await fs.access(envPath);
    loadEnvFile(envPath);
  } catch (error) {
    if (explicitPath || !isMissingFile(error)) throw error;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.rm(temporaryPath, { force: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await fs.rename(temporaryPath, filePath);
}

function parseArgs(args: string[]) {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    }
    options[
      key.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
    ] = value;
  }
  return options;
}

function requireEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requireSafeId(value: string | undefined, option: string) {
  if (!value || value === "latest" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error(`${option} must be a safe, pinned identifier.`);
  }
  return value;
}

function normalizePrefix(value: string) {
  const prefix = value.replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.split("/").includes("..")) {
    throw new Error("--prefix must be a safe, non-empty object prefix.");
  }
  return prefix;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("--required-jurisdiction-count must be a positive integer.");
  }
  return parsed;
}

function isMissingFile(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

if (process.argv[1]?.endsWith("build-r2-environment-deployment.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
