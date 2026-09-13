import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  parseBuildingStoreCatalog,
  parseEnvironmentDeploymentManifest,
  type EnvironmentDeploymentManifest,
} from "@/lib/environment/buildings/deploymentCatalog";

export type ActivateEnvironmentReleaseOptions = {
  targetRoot: string;
  release: string;
  deploymentId: string;
  requiredJurisdictionCount: number;
  confirmActivation?: string;
  dryRun: boolean;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const options: ActivateEnvironmentReleaseOptions = {
    targetRoot: path.resolve(requireOption(args.targetRoot, "--target-root")),
    release: requireSafeId(args.release, "--release"),
    deploymentId: requireSafeId(args.deploymentId, "--deployment-id"),
    requiredJurisdictionCount: parsePositiveInteger(
      args.requiredJurisdictionCount,
      51,
    ),
    confirmActivation: args.confirmActivation,
    dryRun: args.dryRun === "true",
  };
  const result = await activateEnvironmentRelease(options);
  console.log(JSON.stringify(result, null, 2));
}

export async function activateEnvironmentRelease(
  options: ActivateEnvironmentReleaseOptions,
) {
  const catalogPath = path.join(
    options.targetRoot,
    "releases",
    options.release,
    "building-store-catalog.json",
  );
  const catalogBytes = await fs.readFile(catalogPath);
  const catalog = parseBuildingStoreCatalog(
    JSON.parse(catalogBytes.toString("utf8")),
  );
  if (catalog.release !== options.release) {
    throw new Error("Activation release does not match the building store catalog.");
  }
  if (catalog.summary.jurisdictionCount !== options.requiredJurisdictionCount) {
    throw new Error(
      `Activation requires ${options.requiredJurisdictionCount} jurisdictions; catalog contains ${catalog.summary.jurisdictionCount}.`,
    );
  }
  await verifyCatalogManifests(path.dirname(catalogPath), catalog.stores);

  const catalogSha256 = sha256Buffer(catalogBytes);
  const catalogRelativePath = path.posix.join(
    "releases",
    options.release,
    "catalogs",
    `${catalogSha256}.json`,
  );
  const immutableCatalogPath = path.join(options.targetRoot, catalogRelativePath);
  const deploymentsRoot = path.join(options.targetRoot, "deployments");
  const historyPath = path.join(
    deploymentsRoot,
    "history",
    `${options.deploymentId}.json`,
  );
  const activePath = path.join(deploymentsRoot, "production-active.json");

  if (options.dryRun) {
    return {
      mode: "dry-run" as const,
      deploymentId: options.deploymentId,
      release: options.release,
      catalogPath,
      immutableCatalogPath,
      catalogSha256,
      summary: catalog.summary,
      activePath,
    };
  }
  if (options.confirmActivation !== options.deploymentId) {
    throw new Error(
      `--confirm-activation must be exactly '${options.deploymentId}'.`,
    );
  }

  const existing = await readExistingDeployment(historyPath);
  const deployment = existing ?? {
    format: "comfortos-environment-deployment-v1" as const,
    deploymentId: options.deploymentId,
    activatedAt: new Date().toISOString(),
    status: "active" as const,
    release: options.release,
    catalogPath: catalogRelativePath,
    catalogSha256,
    source: catalog.source,
    summary: catalog.summary,
  };
  assertSameActivation(deployment, {
    deploymentId: options.deploymentId,
    release: options.release,
    catalogPath: catalogRelativePath,
    catalogSha256,
  });
  await writeImmutableBytes(immutableCatalogPath, catalogBytes, catalogSha256);
  if (!existing) await writeJsonImmutable(historyPath, deployment);
  await writeJsonAtomic(activePath, deployment);

  return {
    mode: "activate" as const,
    deploymentId: deployment.deploymentId,
    release: deployment.release,
    catalogSha256: deployment.catalogSha256,
    summary: deployment.summary,
    historyPath,
    activePath,
    reusedHistory: existing !== null,
  };
}

async function verifyCatalogManifests(
  catalogRoot: string,
  stores: ReturnType<typeof parseBuildingStoreCatalog>["stores"],
) {
  for (const store of stores) {
    const storeRoot = resolveContainedPath(catalogRoot, store.relativePath);
    const manifestPath = path.join(storeRoot, "manifest.json");
    if ((await sha256File(manifestPath)) !== store.manifestSha256) {
      throw new Error(`Activation manifest checksum mismatch: ${store.partitionId}`);
    }
  }
}

async function readExistingDeployment(filePath: string) {
  try {
    return parseEnvironmentDeploymentManifest(
      JSON.parse(await fs.readFile(filePath, "utf8")),
    );
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

function assertSameActivation(
  deployment: EnvironmentDeploymentManifest,
  expected: Pick<
    EnvironmentDeploymentManifest,
    "deploymentId" | "release" | "catalogPath" | "catalogSha256"
  >,
) {
  if (
    deployment.deploymentId !== expected.deploymentId ||
    deployment.release !== expected.release ||
    deployment.catalogPath !== expected.catalogPath ||
    deployment.catalogSha256 !== expected.catalogSha256
  ) {
    throw new Error(
      `Deployment history conflict: ${expected.deploymentId} already identifies different data.`,
    );
  }
}

async function writeJsonImmutable(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

async function writeImmutableBytes(
  filePath: string,
  bytes: Buffer,
  expectedSha256: string,
) {
  try {
    const existing = await fs.readFile(filePath);
    if (sha256Buffer(existing) !== expectedSha256) {
      throw new Error(`Immutable catalog conflict: ${filePath}`);
    }
    return;
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes, { flag: "wx" });
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
    throw new Error(`Catalog store path escapes its release root: ${relativePath}`);
  }
  return resolved;
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function sha256Buffer(value: Buffer) {
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

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("--required-jurisdiction-count must be a positive integer.");
  }
  return parsed;
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

if (process.argv[1]?.endsWith("activate-environment-release.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
