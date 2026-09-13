import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  parseBuildingStoreCatalog,
  parseEnvironmentDeploymentManifest,
  type EnvironmentDeploymentManifest,
} from "@/lib/environment/buildings/deploymentCatalog";

export type RollbackEnvironmentDeploymentOptions = {
  targetRoot: string;
  deploymentId: string;
  confirmRollback?: string;
  dryRun: boolean;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const options: RollbackEnvironmentDeploymentOptions = {
    targetRoot: path.resolve(requireOption(args.targetRoot, "--target-root")),
    deploymentId: requireSafeId(args.deploymentId, "--deployment-id"),
    confirmRollback: args.confirmRollback,
    dryRun: args.dryRun === "true",
  };
  console.log(JSON.stringify(await rollbackEnvironmentDeployment(options), null, 2));
}

export async function rollbackEnvironmentDeployment(
  options: RollbackEnvironmentDeploymentOptions,
) {
  const expectedConfirmation = `ROLLBACK:${options.deploymentId}`;
  const deploymentsRoot = path.join(options.targetRoot, "deployments");
  const historyPath = path.join(
    deploymentsRoot,
    "history",
    `${options.deploymentId}.json`,
  );
  const activePath = path.join(deploymentsRoot, "production-active.json");
  const target = parseEnvironmentDeploymentManifest(
    JSON.parse(await fs.readFile(historyPath, "utf8")),
  );
  await verifyHistoricalDeployment(options.targetRoot, target);
  const current = await readOptionalDeployment(activePath);

  if (!options.dryRun && options.confirmRollback !== expectedConfirmation) {
    throw new Error(
      `--confirm-rollback must be exactly '${expectedConfirmation}'.`,
    );
  }
  if (!options.dryRun) await writeJsonAtomic(activePath, target);

  return {
    mode: options.dryRun ? ("dry-run" as const) : ("rollback" as const),
    fromDeploymentId: current?.deploymentId ?? null,
    toDeploymentId: target.deploymentId,
    release: target.release,
    catalogSha256: target.catalogSha256,
    activePath,
  };
}

async function verifyHistoricalDeployment(
  targetRoot: string,
  deployment: EnvironmentDeploymentManifest,
) {
  const catalogPath = resolveContainedPath(targetRoot, deployment.catalogPath);
  const bytes = await fs.readFile(catalogPath);
  if (sha256(bytes) !== deployment.catalogSha256) {
    throw new Error("Rollback catalog checksum mismatch.");
  }
  const catalog = parseBuildingStoreCatalog(JSON.parse(bytes.toString("utf8")));
  if (
    catalog.release !== deployment.release ||
    JSON.stringify(catalog.source) !== JSON.stringify(deployment.source) ||
    JSON.stringify(catalog.summary) !== JSON.stringify(deployment.summary)
  ) {
    throw new Error("Rollback catalog does not match deployment history.");
  }
}

async function readOptionalDeployment(filePath: string) {
  try {
    return parseEnvironmentDeploymentManifest(
      JSON.parse(await fs.readFile(filePath, "utf8")),
    );
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
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

function resolveContainedPath(root: string, relativePath: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).includes("..") ||
    (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`))
  ) {
    throw new Error(`Rollback path escapes its deployment root: ${relativePath}`);
  }
  return resolved;
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
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

function requireSafeId(value: string | undefined, option: string) {
  const result = requireOption(value, option);
  if (result === "latest" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(result)) {
    throw new Error(`${option} must be a safe, pinned identifier.`);
  }
  return result;
}

function requireOption(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function isMissingFile(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

if (process.argv[1]?.endsWith("rollback-environment-deployment.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
