import fs from "node:fs/promises";
import path from "node:path";
import { parseEnvironmentDeploymentManifest } from "@/lib/environment/buildings/deploymentCatalog";

const DEFAULT_ACTIVE_MANIFEST =
  "deploy/cloudflare-environment/generated/deployment/deployments/production-active.json";
const DEFAULT_WRANGLER_CONFIG = "wrangler.environment-service.generated.jsonc";

export type SyncCloudflareEnvironmentConfigOptions = {
  activeManifestPath: string;
  wranglerConfigPath: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await syncCloudflareEnvironmentConfig({
    activeManifestPath: path.resolve(
      args.activeManifest ?? DEFAULT_ACTIVE_MANIFEST,
    ),
    wranglerConfigPath: path.resolve(
      args.wranglerConfig ?? DEFAULT_WRANGLER_CONFIG,
    ),
  });
  console.log(JSON.stringify(result, null, 2));
}

export async function syncCloudflareEnvironmentConfig(
  options: SyncCloudflareEnvironmentConfigOptions,
) {
  const deployment = parseEnvironmentDeploymentManifest(
    JSON.parse(await fs.readFile(options.activeManifestPath, "utf8")),
  );
  const config = asRecord(
    JSON.parse(await fs.readFile(options.wranglerConfigPath, "utf8")),
    "Wrangler config",
  );
  const vars = asRecord(config.vars, "Wrangler config vars");
  const updated = {
    ...config,
    vars: {
      ...vars,
      ENVIRONMENT_DEPLOYMENT_ID: deployment.deploymentId,
      ENVIRONMENT_RELEASE: deployment.release,
    },
  };
  await writeJsonAtomic(options.wranglerConfigPath, updated);

  return {
    deploymentId: deployment.deploymentId,
    release: deployment.release,
    wranglerConfigPath: options.wranglerConfigPath,
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
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

async function writeJsonAtomic(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.rm(temporaryPath, { force: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await fs.rename(temporaryPath, filePath);
}

if (process.argv[1]?.endsWith("sync-cloudflare-environment-config.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
