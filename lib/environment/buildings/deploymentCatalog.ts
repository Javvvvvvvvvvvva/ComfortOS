import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { LocalOvertureStoreManifest } from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";

export type BuildingStoreCatalogEntry = {
  jurisdictionCode: string;
  partitionId: string;
  relativePath: string;
  manifestSha256: string;
  objectCount: number;
  storedBytes: number;
  manifest: LocalOvertureStoreManifest;
};

export type BuildingStoreCatalog = {
  format: "comfortos-building-store-catalog-v1";
  generatedAt: string;
  release: string;
  source: {
    provider: string;
    location: string;
    prefix: string;
  };
  summary: {
    jurisdictionCount: number;
    storeCount: number;
    objectCount: number;
    storedBytes: number;
    buildingCount: number;
    usableHeightCount: number;
  };
  stores: BuildingStoreCatalogEntry[];
};

export type EnvironmentDeploymentManifest = {
  format: "comfortos-environment-deployment-v1";
  deploymentId: string;
  activatedAt: string;
  status: "active";
  release: string;
  catalogPath: string;
  catalogSha256: string;
  source: BuildingStoreCatalog["source"];
  summary: BuildingStoreCatalog["summary"];
};

export type ActiveBuildingDeployment = {
  deployment: EnvironmentDeploymentManifest;
  catalog: BuildingStoreCatalog;
  stores: Array<{
    storeDir: string;
    manifestSha256: string;
    manifest: LocalOvertureStoreManifest;
  }>;
};

export type ActiveBuildingDeploymentOptions = {
  storeRoot?: string;
  verifyStorePresence?: boolean;
};

export function loadActiveBuildingDeployment(
  deploymentManifestPath: string,
  options: ActiveBuildingDeploymentOptions = {},
): ActiveBuildingDeployment {
  const resolvedDeploymentPath = fs.realpathSync(deploymentManifestPath);
  const dataRoot = path.dirname(path.dirname(resolvedDeploymentPath));
  const deployment = parseEnvironmentDeploymentManifest(
    JSON.parse(fs.readFileSync(resolvedDeploymentPath, "utf8")),
  );
  const catalogPath = resolveContainedPath(dataRoot, deployment.catalogPath);
  const catalogBytes = fs.readFileSync(catalogPath);
  const catalogSha256 = sha256(catalogBytes);
  if (catalogSha256 !== deployment.catalogSha256) {
    throw new Error("Active environment catalog checksum mismatch.");
  }
  const catalog = parseBuildingStoreCatalog(JSON.parse(catalogBytes.toString("utf8")));
  if (catalog.release !== deployment.release) {
    throw new Error("Active environment deployment release does not match its catalog.");
  }
  if (JSON.stringify(catalog.source) !== JSON.stringify(deployment.source)) {
    throw new Error("Active environment deployment source does not match its catalog.");
  }
  if (JSON.stringify(catalog.summary) !== JSON.stringify(deployment.summary)) {
    throw new Error("Active environment deployment summary does not match its catalog.");
  }

  if (options.storeRoot && !path.isAbsolute(options.storeRoot)) {
    throw new Error("Active environment store root must be absolute.");
  }
  const catalogRoot = options.storeRoot
    ? path.resolve(options.storeRoot)
    : resolveContainedPath(
        dataRoot,
        path.posix.join("releases", catalog.release),
      );
  const verifyStorePresence = options.verifyStorePresence ?? true;
  const stores = catalog.stores.map((entry) => {
    const storeDir = resolveContainedPath(catalogRoot, entry.relativePath);
    if (verifyStorePresence) {
      let storeStats: fs.Stats;
      let manifestStats: fs.Stats;
      try {
        storeStats = fs.statSync(storeDir);
        manifestStats = fs.statSync(path.join(storeDir, "manifest.json"));
      } catch {
        throw new Error(`Active environment store is missing: ${entry.partitionId}`);
      }
      if (!storeStats.isDirectory() || !manifestStats.isFile()) {
        throw new Error(`Active environment store is incomplete: ${entry.partitionId}`);
      }
    }
    return {
      storeDir,
      manifestSha256: entry.manifestSha256,
      manifest: entry.manifest,
    };
  });
  return {
    deployment,
    catalog,
    stores,
  };
}

export function parseEnvironmentDeploymentManifest(
  value: unknown,
): EnvironmentDeploymentManifest {
  const deployment = asRecord(value, "environment deployment manifest");
  if (
    deployment.format !== "comfortos-environment-deployment-v1" ||
    deployment.status !== "active" ||
    !isSafeId(deployment.deploymentId) ||
    !isPinnedRelease(deployment.release) ||
    !isSafeRelativePath(deployment.catalogPath) ||
    !isSha256(deployment.catalogSha256)
  ) {
    throw new Error("Invalid active environment deployment manifest.");
  }

  return {
    format: deployment.format,
    deploymentId: deployment.deploymentId,
    activatedAt: requireTimestamp(deployment.activatedAt, "deployment activatedAt"),
    status: deployment.status,
    release: deployment.release,
    catalogPath: deployment.catalogPath,
    catalogSha256: deployment.catalogSha256,
    source: parseSource(deployment.source),
    summary: parseSummary(deployment.summary),
  };
}

export function parseBuildingStoreCatalog(value: unknown): BuildingStoreCatalog {
  const catalog = asRecord(value, "building store catalog");
  if (
    catalog.format !== "comfortos-building-store-catalog-v1" ||
    !isPinnedRelease(catalog.release) ||
    !Array.isArray(catalog.stores)
  ) {
    throw new Error("Invalid building store catalog.");
  }
  const stores = catalog.stores.map(parseStoreEntry);
  const summary = parseSummary(catalog.summary);
  const jurisdictionCount = new Set(stores.map((entry) => entry.jurisdictionCode)).size;
  const calculated = {
    jurisdictionCount,
    storeCount: stores.length,
    objectCount: stores.reduce((total, entry) => total + entry.objectCount, 0),
    storedBytes: stores.reduce((total, entry) => total + entry.storedBytes, 0),
    buildingCount: stores.reduce(
      (total, entry) => total + entry.manifest.buildingCount,
      0,
    ),
    usableHeightCount: stores.reduce(
      (total, entry) =>
        total +
        entry.manifest.explicitHeightCount +
        entry.manifest.floorDerivedHeightCount,
      0,
    ),
  };
  if (JSON.stringify(summary) !== JSON.stringify(calculated)) {
    throw new Error("Building store catalog summary is inconsistent.");
  }
  const partitionIds = new Set<string>();
  for (const entry of stores) {
    if (partitionIds.has(entry.partitionId)) {
      throw new Error(`Duplicate building store partition: ${entry.partitionId}`);
    }
    partitionIds.add(entry.partitionId);
    if (entry.manifest.release !== catalog.release) {
      throw new Error(`Building store release mismatch: ${entry.partitionId}`);
    }
  }

  return {
    format: catalog.format,
    generatedAt: requireTimestamp(catalog.generatedAt, "catalog generatedAt"),
    release: catalog.release,
    source: parseSource(catalog.source),
    summary,
    stores,
  };
}

function parseStoreEntry(value: unknown): BuildingStoreCatalogEntry {
  const entry = asRecord(value, "building store catalog entry");
  const manifest = asRecord(entry.manifest, "building store manifest");
  if (
    !isStateCode(entry.jurisdictionCode) ||
    !isSafeId(entry.partitionId) ||
    !isSafeRelativePath(entry.relativePath) ||
    !isSha256(entry.manifestSha256) ||
    !isNonNegativeInteger(entry.objectCount) ||
    !isNonNegativeInteger(entry.storedBytes) ||
    manifest.format !== "comfortos-local-building-store-v1" ||
    manifest.source !== "overture-buildings" ||
    manifest.region !== entry.partitionId ||
    !isPinnedRelease(manifest.release) ||
    !isBounds(manifest.bbox) ||
    !isPositiveNumber(manifest.tileSizeDegrees) ||
    !isNonNegativeInteger(manifest.buildingCount) ||
    !isNonNegativeInteger(manifest.explicitHeightCount) ||
    !isNonNegativeInteger(manifest.floorDerivedHeightCount) ||
    !isNonNegativeInteger(manifest.unknownHeightCount) ||
    manifest.explicitHeightCount +
      manifest.floorDerivedHeightCount +
      manifest.unknownHeightCount !==
      manifest.buildingCount
  ) {
    throw new Error("Invalid building store catalog entry.");
  }
  return {
    jurisdictionCode: entry.jurisdictionCode,
    partitionId: entry.partitionId,
    relativePath: entry.relativePath,
    manifestSha256: entry.manifestSha256,
    objectCount: entry.objectCount,
    storedBytes: entry.storedBytes,
    manifest: manifest as LocalOvertureStoreManifest,
  };
}

function parseSource(value: unknown): BuildingStoreCatalog["source"] {
  const source = asRecord(value, "building store source");
  if (
    typeof source.provider !== "string" ||
    !source.provider ||
    typeof source.location !== "string" ||
    !source.location ||
    typeof source.prefix !== "string" ||
    !source.prefix
  ) {
    throw new Error("Invalid building store source.");
  }
  return {
    provider: source.provider,
    location: source.location,
    prefix: source.prefix,
  };
}

function parseSummary(value: unknown): BuildingStoreCatalog["summary"] {
  const summary = asRecord(value, "building store summary");
  const result = {
    jurisdictionCount: summary.jurisdictionCount,
    storeCount: summary.storeCount,
    objectCount: summary.objectCount,
    storedBytes: summary.storedBytes,
    buildingCount: summary.buildingCount,
    usableHeightCount: summary.usableHeightCount,
  };
  if (!Object.values(result).every(isNonNegativeInteger)) {
    throw new Error("Invalid building store summary.");
  }
  return result as BuildingStoreCatalog["summary"];
}

function resolveContainedPath(root: string, relativePath: string) {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error(`Unsafe deployment path: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Deployment path escapes its data root: ${relativePath}`);
  }
  return resolved;
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${name}.`);
  }
  return value as Record<string, unknown>;
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function isStateCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}

function isPinnedRelease(value: unknown): value is string {
  return isSafeId(value) && value !== "latest";
}

function isSafeRelativePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Boolean(value) &&
    !path.isAbsolute(value) &&
    !value.split(/[\\/]/).includes("..")
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isBounds(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item)) &&
    value[0] < value[2] &&
    value[1] < value[3]
  );
}

function requireTimestamp(value: unknown, name: string) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
