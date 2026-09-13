import fs from "node:fs/promises";
import path from "node:path";
import { loadActiveBuildingDeployment } from "@/lib/environment/buildings/deploymentCatalog";
import {
  dedupeCatalogBuildingStores,
  MultiRegionOvertureBuildingProvider,
} from "@/lib/environment/buildings/providers/multiRegionOvertureBuildingProvider";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const deploymentRoot = path.resolve(
    args.deploymentRoot ?? "deploy/cloudflare-environment/generated/deployment",
  );
  const activePath = path.join(
    deploymentRoot,
    "deployments",
    "production-active.json",
  );
  const expectedJurisdictions = parsePositiveInteger(
    args.expectedJurisdictions,
    51,
  );
  const expectedStores = parsePositiveInteger(args.expectedStores, 20_758);
  const maximumBundleBytes = parsePositiveInteger(
    args.maximumBundleBytes,
    64 * 1024 * 1024,
  );
  const maximumStartupMs = parsePositiveInteger(args.maximumStartupMs, 10_000);
  const release = args.release ?? "2026-08-19.0";

  const beforeHeap = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const active = loadActiveBuildingDeployment(activePath, {
    storeRoot: `/mnt/r2/overture-buildings/${release}`,
    verifyStorePresence: false,
  });
  const provider = new MultiRegionOvertureBuildingProvider({
    catalogStores: active.stores,
    maxLoadedStores: 8,
  });
  const uniqueStores = dedupeCatalogBuildingStores(active.stores);
  const metadata = await provider.getMetadata();
  const startupMs = Math.round(performance.now() - startedAt);
  const heapGrowthBytes = Math.max(0, process.memoryUsage().heapUsed - beforeHeap);
  const bundleBytes = await directoryBytes(deploymentRoot);
  const failures: string[] = [];
  if (active.catalog.source.provider !== "cloudflare-r2") {
    failures.push("catalog source is not Cloudflare R2");
  }
  if (active.catalog.summary.jurisdictionCount !== expectedJurisdictions) {
    failures.push("jurisdiction count does not match");
  }
  if (active.catalog.summary.storeCount !== expectedStores) {
    failures.push("store count does not match");
  }
  if (bundleBytes > maximumBundleBytes) failures.push("bundle exceeds size budget");
  if (startupMs > maximumStartupMs) failures.push("catalog startup exceeds budget");
  if (metadata.datasetVersion !== release) failures.push("dataset release does not match");

  const report = {
    format: "comfortos-environment-deployment-bundle-audit-v1",
    createdAt: new Date().toISOString(),
    deploymentId: active.deployment.deploymentId,
    release: active.deployment.release,
    provider: active.catalog.source.provider,
    summary: active.catalog.summary,
    queryStoreCount: uniqueStores.length,
    duplicateBorderStoreCount: active.stores.length - uniqueStores.length,
    bundleBytes,
    startupMs,
    heapGrowthBytes,
    maximumBundleBytes,
    maximumStartupMs,
    accepted: failures.length === 0,
    failures,
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
}

async function directoryBytes(root: string): Promise<number> {
  let total = 0;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(target);
    else if (entry.isFile()) total += (await fs.stat(target)).size;
  }
  return total;
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
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Expected a positive integer option.");
  }
  return parsed;
}

if (process.argv[1]?.endsWith("audit-environment-deployment-bundle.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
