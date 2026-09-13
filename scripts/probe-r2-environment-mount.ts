import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  parseBuildingStoreCatalog,
  parseEnvironmentDeploymentManifest,
} from "@/lib/environment/buildings/deploymentCatalog";

export type ProbeR2EnvironmentMountOptions = {
  activeManifestPath: string;
  storeRoot: string;
};

async function main() {
  const activeManifestPath = requireEnvironment(
    "ENVIRONMENT_ACTIVE_DEPLOYMENT_MANIFEST",
  );
  const storeRoot = requireEnvironment("ENVIRONMENT_DEPLOYMENT_STORE_ROOT");
  await probeR2EnvironmentMount({ activeManifestPath, storeRoot });
}

export async function probeR2EnvironmentMount(
  options: ProbeR2EnvironmentMountOptions,
) {
  const deploymentRoot = path.dirname(path.dirname(options.activeManifestPath));
  const deployment = parseEnvironmentDeploymentManifest(
    JSON.parse(await fs.readFile(options.activeManifestPath, "utf8")),
  );
  const catalogPath = resolveContainedPath(deploymentRoot, deployment.catalogPath);
  const catalogBytes = await fs.readFile(catalogPath);
  if (sha256(catalogBytes) !== deployment.catalogSha256) {
    throw new Error("Active deployment catalog checksum mismatch.");
  }
  const catalog = parseBuildingStoreCatalog(
    JSON.parse(catalogBytes.toString("utf8")),
  );
  const store =
    catalog.stores.find((candidate) => candidate.manifest.buildingCount > 0) ??
    catalog.stores[0];
  if (!store) throw new Error("Active deployment catalog contains no stores.");

  const storeDir = resolveContainedPath(options.storeRoot, store.relativePath);
  const manifestBytes = await fs.readFile(path.join(storeDir, "manifest.json"));
  if (sha256(manifestBytes) !== store.manifestSha256) {
    throw new Error("R2 partition manifest checksum mismatch.");
  }
  JSON.parse(manifestBytes.toString("utf8"));
  JSON.parse(await fs.readFile(path.join(storeDir, "tile-index.json"), "utf8"));
  await Promise.all([
    assertReadable(path.join(storeDir, "building-offsets.bin")),
    assertReadable(path.join(storeDir, "buildings.jsonl")),
  ]);

  return {
    deploymentId: deployment.deploymentId,
    release: deployment.release,
    partitionId: store.partitionId,
  };
}

async function assertReadable(filePath: string) {
  const handle = await fs.open(filePath, "r");
  try {
    await handle.read(Buffer.alloc(1), 0, 1, 0);
  } finally {
    await handle.close();
  }
}

function resolveContainedPath(root: string, relativePath: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).includes("..") ||
    (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`))
  ) {
    throw new Error("Environment mount probe path escapes its configured root.");
  }
  return resolved;
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

if (process.argv[1]?.endsWith("probe-r2-environment-mount.mjs")) {
  main().catch(() => {
    console.error("R2 deployment store is not ready.");
    process.exit(1);
  });
}
