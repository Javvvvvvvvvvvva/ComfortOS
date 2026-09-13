import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";
import {
  parseBuildingStoreCatalog,
  type BuildingStoreCatalog,
  type BuildingStoreCatalogEntry,
} from "@/lib/environment/buildings/deploymentCatalog";
import type { LocalOvertureStoreManifest } from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";
import {
  createFilesystemObjectStore,
  createR2ObjectStore,
  type ArchiveObject,
  type ObjectStore,
  type StateArchiveCheckpoint,
  type StateArchiveManifest,
} from "@/scripts/archive-us-state-overture";

const STATE_MANIFEST_FILE = "state-archive-manifest.json";
const STATE_RECEIPT_FILE = "state-restore-receipt.json";
const CATALOG_FILE = "building-store-catalog.json";
const MAX_STATE_MANIFEST_BYTES = 64 * 1024 * 1024;
const RESTORE_CONCURRENCY = 4;
const REMOTE_CATALOG_CONCURRENCY = 16;
const DEFAULT_MINIMUM_FREE_BYTES = 5 * 1024 * 1024 * 1024;
const STORE_FILES = new Set([
  "buildings.jsonl",
  "tile-index.json",
  "building-offsets.bin",
  "manifest.json",
]);

export type ReleaseRestoreOptions = {
  release: string;
  states: string[];
  checkpointRoot: string;
  targetRoot: string;
  prefix: string;
  dryRun: boolean;
  preflightOnly: boolean;
  confirmRestore?: string;
  minimumFreeBytes?: number;
};

export type RemoteReleaseCatalogOptions = Pick<
  ReleaseRestoreOptions,
  "release" | "states" | "checkpointRoot" | "targetRoot" | "prefix"
>;

type StateRestoreReceipt = {
  format: "comfortos-state-restore-receipt-v1";
  restoredAt: string;
  release: string;
  jurisdiction: StateArchiveManifest["jurisdiction"];
  source: BuildingStoreCatalog["source"];
  stateManifestKey: string;
  stateManifestSha256: string;
  partitionCount: number;
  objectCount: number;
  storedBytes: number;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadRestoreEnvironment(args.envFile);
  const dryRun = args.dryRun === "true";
  const preflightOnly = args.preflight === "true";
  if (dryRun && preflightOnly) {
    throw new Error("--dry-run and --preflight cannot both be true.");
  }
  const release = requirePinnedRelease(args.release);
  const checkpointRoot = path.resolve(
    args.checkpointRoot ?? "config/data-regions/archive-checkpoints",
  );
  const states = await resolveStates(args.states ?? "all", checkpointRoot, release);
  const targetRoot = path.resolve(args.targetRoot ?? "/data/comfortos");
  const options: ReleaseRestoreOptions = {
    release,
    states,
    checkpointRoot,
    targetRoot,
    prefix: normalizePrefix(args.prefix ?? "overture-buildings"),
    dryRun,
    preflightOnly,
    confirmRestore: args.confirmRestore,
    minimumFreeBytes: parseNonNegativeInteger(
      args.minimumFreeBytes,
      DEFAULT_MINIMUM_FREE_BYTES,
    ),
  };
  const store = dryRun ? undefined : createConfiguredObjectStore(args);
  const result = await restoreRelease(options, store);
  console.log(JSON.stringify(result, null, 2));
}

export async function restoreRelease(
  options: ReleaseRestoreOptions,
  store?: ObjectStore,
) {
  assertRestoreOptions(options);
  const checkpoints = await loadCheckpoints(options);
  const planned = summarizeCheckpoints(checkpoints);
  if (options.dryRun) {
    return {
      mode: "dry-run" as const,
      release: options.release,
      states: checkpoints.map((checkpoint) => checkpoint.jurisdiction.code),
      ...planned,
    };
  }
  if (!store) throw new Error("An object store is required outside dry-run mode.");
  assertArchiveStoreMatches(checkpoints, store);

  const stateArchives: Array<{ manifest: StateArchiveManifest; bytes: Buffer }> = [];
  for (const checkpoint of checkpoints) {
    stateArchives.push(
      await readAndValidateStateArchive(store, checkpoint, options.prefix),
    );
  }
  if (options.preflightOnly) {
    return {
      mode: "preflight" as const,
      release: options.release,
      provider: store.provider,
      location: store.location,
      states: stateArchives.map(({ manifest }) => manifest.jurisdiction.code),
      ...planned,
      stateManifestCount: stateArchives.length,
    };
  }

  if (options.confirmRestore !== options.release) {
    throw new Error(`--confirm-restore must be exactly '${options.release}'.`);
  }
  await fs.mkdir(options.targetRoot, { recursive: true });
  await assertRestoreCapacity(
    options,
    stateArchives.map(({ manifest }) => manifest),
  );

  let downloadedObjectCount = 0;
  let reusedObjectCount = 0;
  for (let index = 0; index < checkpoints.length; index += 1) {
    const restored = await restoreState({
      options,
      store,
      checkpoint: checkpoints[index],
      manifest: stateArchives[index].manifest,
      manifestBytes: stateArchives[index].bytes,
    });
    downloadedObjectCount += restored.downloadedObjectCount;
    reusedObjectCount += restored.reusedObjectCount;
  }

  const catalog = await buildReleaseCatalog(options.targetRoot, options.release);
  const catalogPath = path.join(
    options.targetRoot,
    "releases",
    options.release,
    CATALOG_FILE,
  );
  await writeJsonAtomic(catalogPath, catalog);

  return {
    mode: "restore" as const,
    release: options.release,
    provider: store.provider,
    location: store.location,
    states: checkpoints.map((checkpoint) => checkpoint.jurisdiction.code),
    downloadedObjectCount,
    reusedObjectCount,
    catalogPath,
    catalogSha256: await sha256File(catalogPath),
    summary: catalog.summary,
  };
}

async function restoreState(input: {
  options: ReleaseRestoreOptions;
  store: ObjectStore;
  checkpoint: StateArchiveCheckpoint;
  manifest: StateArchiveManifest;
  manifestBytes: Buffer;
}) {
  const state = input.checkpoint.jurisdiction.code.toLowerCase();
  const stateRoot = path.join(
    input.options.targetRoot,
    "releases",
    input.options.release,
    "us",
    state,
  );
  const stateManifestPath = path.join(stateRoot, STATE_MANIFEST_FILE);
  await writeImmutableBuffer(
    stateManifestPath,
    input.manifestBytes,
    input.checkpoint.archive.stateManifestSha256,
  );

  let downloadedObjectCount = 0;
  let reusedObjectCount = 0;
  for (
    let offset = 0;
    offset < input.manifest.objects.length;
    offset += RESTORE_CONCURRENCY
  ) {
    const results = await Promise.all(
      input.manifest.objects
        .slice(offset, offset + RESTORE_CONCURRENCY)
        .map(async (object) => {
          const target = path.join(stateRoot, object.partitionId, object.file);
          const existing = await inspectLocalFile(target);
          if (existing.exists) {
            if (
              existing.sizeBytes !== object.sizeBytes ||
              (await sha256File(target)) !== object.sha256
            ) {
              throw new Error(`Restored object conflicts with archive: ${target}`);
            }
            return "reused" as const;
          }
          await input.store.downloadFile(object.key, target, object);
          return "downloaded" as const;
        }),
    );
    for (const result of results) {
      if (result === "downloaded") downloadedObjectCount += 1;
      else reusedObjectCount += 1;
    }
  }

  const receiptPath = path.join(stateRoot, STATE_RECEIPT_FILE);
  const existingReceipt = await readOptionalRestoreReceipt(receiptPath);
  const receipt: StateRestoreReceipt = {
    format: "comfortos-state-restore-receipt-v1",
    restoredAt: existingReceipt?.restoredAt ?? new Date().toISOString(),
    release: input.options.release,
    jurisdiction: input.manifest.jurisdiction,
    source: {
      provider: input.store.provider,
      location: input.store.location,
      prefix: input.options.prefix,
    },
    stateManifestKey: input.checkpoint.archive.stateManifestKey,
    stateManifestSha256: input.checkpoint.archive.stateManifestSha256,
    partitionCount: input.manifest.partitionCount,
    objectCount: input.manifest.objectCount,
    storedBytes: input.manifest.storedBytes,
  };
  if (existingReceipt) {
    if (JSON.stringify(existingReceipt) !== JSON.stringify(receipt)) {
      throw new Error(`Immutable restore receipt conflict: ${receiptPath}`);
    }
  } else {
    await writeJsonAtomic(receiptPath, receipt);
  }
  return { downloadedObjectCount, reusedObjectCount };
}

export async function buildReleaseCatalog(targetRoot: string, release: string) {
  const releaseRoot = path.join(targetRoot, "releases", release);
  const usRoot = path.join(releaseRoot, "us");
  const stateEntries = (await fs.readdir(usRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^[a-z]{2}$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const stores: BuildingStoreCatalogEntry[] = [];
  const receipts: StateRestoreReceipt[] = [];

  for (const stateEntry of stateEntries) {
    const stateRoot = path.join(usRoot, stateEntry.name);
    const receipt = parseRestoreReceipt(
      JSON.parse(await fs.readFile(path.join(stateRoot, STATE_RECEIPT_FILE), "utf8")),
    );
    if (
      receipt.release !== release ||
      receipt.jurisdiction.code.toLowerCase() !== stateEntry.name
    ) {
      throw new Error(`Restore receipt release mismatch: ${stateEntry.name}`);
    }
    const manifestPath = path.join(stateRoot, STATE_MANIFEST_FILE);
    if ((await sha256File(manifestPath)) !== receipt.stateManifestSha256) {
      throw new Error(`Restored state manifest checksum mismatch: ${stateEntry.name}`);
    }
    const manifest = validateStateArchiveManifest(
      JSON.parse(await fs.readFile(manifestPath, "utf8")),
      receipt.jurisdiction.code,
      release,
      receipt.source.prefix,
    );
    if (
      manifest.partitionCount !== receipt.partitionCount ||
      manifest.objectCount !== receipt.objectCount ||
      manifest.storedBytes !== receipt.storedBytes
    ) {
      throw new Error(`Restore receipt summary mismatch: ${stateEntry.name}`);
    }

    const objectsByPartition = groupObjectsByPartition(manifest.objects);
    for (const [partitionId, objects] of objectsByPartition) {
      const manifestObject = objects.find((object) => object.file === "manifest.json");
      if (!manifestObject) {
        throw new Error(`Partition manifest is missing: ${partitionId}`);
      }
      const partitionManifestPath = path.join(stateRoot, partitionId, "manifest.json");
      if ((await sha256File(partitionManifestPath)) !== manifestObject.sha256) {
        throw new Error(`Partition manifest checksum mismatch: ${partitionId}`);
      }
      const partitionManifest = JSON.parse(
        await fs.readFile(partitionManifestPath, "utf8"),
      ) as LocalOvertureStoreManifest;
      stores.push({
        jurisdictionCode: receipt.jurisdiction.code,
        partitionId,
        relativePath: path.posix.join("us", stateEntry.name, partitionId),
        manifestSha256: manifestObject.sha256,
        objectCount: objects.length,
        storedBytes: objects.reduce((total, object) => total + object.sizeBytes, 0),
        manifest: partitionManifest,
      });
    }
    receipts.push(receipt);
  }
  if (!receipts.length) throw new Error("No completed state restores were found.");
  const sources = new Set(receipts.map((receipt) => JSON.stringify(receipt.source)));
  if (sources.size !== 1) {
    throw new Error("Restored states do not share one immutable archive source.");
  }
  stores.sort(
    (left, right) =>
      left.jurisdictionCode.localeCompare(right.jurisdictionCode) ||
      left.partitionId.localeCompare(right.partitionId),
  );
  const catalog: BuildingStoreCatalog = {
    format: "comfortos-building-store-catalog-v1",
    generatedAt: receipts
      .map((receipt) => receipt.restoredAt)
      .sort()
      .at(-1)!,
    release,
    source: receipts[0].source,
    summary: {
      jurisdictionCount: receipts.length,
      storeCount: stores.length,
      objectCount: stores.reduce((total, store) => total + store.objectCount, 0),
      storedBytes: stores.reduce((total, store) => total + store.storedBytes, 0),
      buildingCount: stores.reduce(
        (total, store) => total + store.manifest.buildingCount,
        0,
      ),
      usableHeightCount: stores.reduce(
        (total, store) =>
          total +
          store.manifest.explicitHeightCount +
          store.manifest.floorDerivedHeightCount,
        0,
      ),
    },
    stores,
  };
  return parseBuildingStoreCatalog(catalog);
}

export async function buildRemoteReleaseCatalog(
  options: RemoteReleaseCatalogOptions,
  store: ObjectStore,
) {
  assertRestoreOptions({
    ...options,
    dryRun: false,
    preflightOnly: false,
  });
  const checkpoints = await loadCheckpoints(options);
  assertArchiveStoreMatches(checkpoints, store);

  const stateArchives: StateArchiveManifest[] = [];
  for (const checkpoint of checkpoints) {
    stateArchives.push(
      (await readAndValidateStateArchive(store, checkpoint, options.prefix)).manifest,
    );
  }

  const inputs = stateArchives.flatMap((stateManifest) =>
    [...groupObjectsByPartition(stateManifest.objects)].map(
      ([partitionId, objects]) => ({
        stateManifest,
        partitionId,
        objects,
      }),
    ),
  );
  const stores: BuildingStoreCatalogEntry[] = [];
  for (
    let offset = 0;
    offset < inputs.length;
    offset += REMOTE_CATALOG_CONCURRENCY
  ) {
    stores.push(
      ...(await Promise.all(
        inputs
          .slice(offset, offset + REMOTE_CATALOG_CONCURRENCY)
          .map(async ({ stateManifest, partitionId, objects }) => {
            const manifestObject = objects.find(
              (object) => object.file === "manifest.json",
            );
            if (!manifestObject) {
              throw new Error(`Partition manifest is missing: ${partitionId}`);
            }
            const bytes = await store.readBuffer(
              manifestObject.key,
              manifestObject.sizeBytes,
            );
            if (
              bytes.byteLength !== manifestObject.sizeBytes ||
              sha256Buffer(bytes) !== manifestObject.sha256
            ) {
              throw new Error(
                `Remote partition manifest checksum mismatch: ${partitionId}`,
              );
            }
            return {
              jurisdictionCode: stateManifest.jurisdiction.code,
              partitionId,
              relativePath: path.posix.join(
                "us",
                stateManifest.jurisdiction.code.toLowerCase(),
                partitionId,
              ),
              manifestSha256: manifestObject.sha256,
              objectCount: objects.length,
              storedBytes: objects.reduce(
                (total, object) => total + object.sizeBytes,
                0,
              ),
              manifest: JSON.parse(
                bytes.toString("utf8"),
              ) as LocalOvertureStoreManifest,
            } satisfies BuildingStoreCatalogEntry;
          }),
      )),
    );
  }

  stores.sort(
    (left, right) =>
      left.jurisdictionCode.localeCompare(right.jurisdictionCode) ||
      left.partitionId.localeCompare(right.partitionId),
  );
  const catalog = parseBuildingStoreCatalog({
    format: "comfortos-building-store-catalog-v1",
    generatedAt: stateArchives
      .map((manifest) => manifest.createdAt)
      .sort()
      .at(-1)!,
    release: options.release,
    source: {
      provider: store.provider,
      location: store.location,
      prefix: options.prefix,
    },
    summary: {
      jurisdictionCount: checkpoints.length,
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
    },
    stores,
  });
  const catalogPath = path.join(
    options.targetRoot,
    "releases",
    options.release,
    CATALOG_FILE,
  );
  await writeJsonAtomic(catalogPath, catalog);
  return {
    catalog,
    catalogPath,
    catalogSha256: await sha256File(catalogPath),
    stateManifestCount: stateArchives.length,
    partitionManifestCount: stores.length,
  };
}

async function readAndValidateStateArchive(
  store: ObjectStore,
  checkpoint: StateArchiveCheckpoint,
  prefix: string,
) {
  const bytes = await store.readBuffer(
    checkpoint.archive.stateManifestKey,
    MAX_STATE_MANIFEST_BYTES,
  );
  if (sha256Buffer(bytes) !== checkpoint.archive.stateManifestSha256) {
    throw new Error(
      `Remote state manifest checksum mismatch: ${checkpoint.jurisdiction.code}`,
    );
  }
  const manifest = validateStateArchiveManifest(
    JSON.parse(bytes.toString("utf8")),
    checkpoint.jurisdiction.code,
    checkpoint.release,
    prefix,
  );
  if (
    manifest.partitionCount !== checkpoint.archive.partitionCount ||
    manifest.objectCount !== checkpoint.archive.objectCount ||
    manifest.storedBytes !== checkpoint.archive.storedBytes ||
    manifest.dataset.buildingCount !== checkpoint.dataset.buildingCount ||
    manifest.dataset.usableHeightCount !== checkpoint.dataset.usableHeightCount ||
    manifest.dataset.usableHeightRatio !== checkpoint.dataset.usableHeightRatio
  ) {
    throw new Error(
      `Remote state manifest summary mismatch: ${checkpoint.jurisdiction.code}`,
    );
  }
  return { manifest, bytes };
}

export function validateStateArchiveManifest(
  value: unknown,
  state: string,
  release: string,
  prefix: string,
): StateArchiveManifest {
  const manifest = value as Partial<StateArchiveManifest>;
  if (
    !value ||
    typeof value !== "object" ||
    manifest.format !== "comfortos-us-state-overture-archive-v1" ||
    manifest.release !== release ||
    manifest.source !== "overture-buildings" ||
    manifest.jurisdiction?.code !== state ||
    !manifest.dataset ||
    !Number.isSafeInteger(manifest.dataset.buildingCount) ||
    !Number.isSafeInteger(manifest.dataset.usableHeightCount) ||
    manifest.dataset.buildingCount < 0 ||
    manifest.dataset.usableHeightCount < 0 ||
    (manifest.dataset.usableHeightRatio !== null &&
      (typeof manifest.dataset.usableHeightRatio !== "number" ||
        !Number.isFinite(manifest.dataset.usableHeightRatio) ||
        manifest.dataset.usableHeightRatio < 0 ||
        manifest.dataset.usableHeightRatio > 1)) ||
    !Array.isArray(manifest.objects) ||
    !Number.isSafeInteger(manifest.partitionCount) ||
    !Number.isSafeInteger(manifest.objectCount) ||
    !Number.isSafeInteger(manifest.storedBytes) ||
    manifest.partitionCount! < 0 ||
    manifest.objectCount! < 0 ||
    manifest.storedBytes! < 0
  ) {
    throw new Error(`Invalid state archive manifest: ${state}`);
  }
  const objects = manifest.objects as ArchiveObject[];
  if (
    objects.length !== manifest.objectCount ||
    objects.reduce((total, object) => total + object.sizeBytes, 0) !==
      manifest.storedBytes
  ) {
    throw new Error(`State archive object summary mismatch: ${state}`);
  }
  const seenKeys = new Set<string>();
  const partitions = new Set<string>();
  for (const object of objects) {
    const expectedKey = path.posix.join(
      prefix,
      release,
      "us",
      state.toLowerCase(),
      object.partitionId,
      object.file,
    );
    if (
      !/^[a-z0-9-]+$/.test(object.partitionId) ||
      !STORE_FILES.has(object.file) ||
      object.key !== expectedKey ||
      !Number.isSafeInteger(object.sizeBytes) ||
      object.sizeBytes < 0 ||
      !/^[a-f0-9]{64}$/.test(object.sha256) ||
      seenKeys.has(object.key)
    ) {
      throw new Error(`Invalid state archive object: ${state}`);
    }
    seenKeys.add(object.key);
    partitions.add(object.partitionId);
  }
  if (
    partitions.size !== manifest.partitionCount ||
    objects.length !== partitions.size * STORE_FILES.size
  ) {
    throw new Error(`State archive partition summary mismatch: ${state}`);
  }
  for (const partitionObjects of groupObjectsByPartition(objects).values()) {
    if (
      partitionObjects.length !== STORE_FILES.size ||
      new Set(partitionObjects.map((object) => object.file)).size !== STORE_FILES.size
    ) {
      throw new Error(`State archive partition is incomplete: ${state}`);
    }
  }
  return manifest as StateArchiveManifest;
}

async function loadCheckpoints(options: RemoteReleaseCatalogOptions) {
  const checkpoints: StateArchiveCheckpoint[] = [];
  for (const state of options.states) {
    const checkpointPath = path.join(
      options.checkpointRoot,
      options.release,
      `${state.toLowerCase()}.json`,
    );
    const checkpoint = JSON.parse(
      await fs.readFile(checkpointPath, "utf8"),
    ) as StateArchiveCheckpoint;
    if (
      checkpoint.format !== "comfortos-us-state-archive-checkpoint-v1" ||
      checkpoint.release !== options.release ||
      checkpoint.jurisdiction.code !== state ||
      checkpoint.archive.provider !== "cloudflare-r2" &&
        checkpoint.archive.provider !== "filesystem" ||
      checkpoint.archive.prefix !== options.prefix ||
      checkpoint.archive.remoteVerified !== true ||
      !/^[a-f0-9]{64}$/.test(checkpoint.archive.stateManifestSha256)
    ) {
      throw new Error(`Invalid archive checkpoint: ${checkpointPath}`);
    }
    checkpoints.push(checkpoint);
  }
  return checkpoints;
}

function assertArchiveStoreMatches(
  checkpoints: StateArchiveCheckpoint[],
  store: ObjectStore,
) {
  for (const checkpoint of checkpoints) {
    if (
      checkpoint.archive.provider !== store.provider ||
      checkpoint.archive.location !== store.location
    ) {
      throw new Error(
        `Archive checkpoint source does not match the configured object store: ${checkpoint.jurisdiction.code}`,
      );
    }
  }
}

async function assertRestoreCapacity(
  options: ReleaseRestoreOptions,
  manifests: StateArchiveManifest[],
) {
  let missingBytes = 0;
  for (const manifest of manifests) {
    const stateRoot = path.join(
      options.targetRoot,
      "releases",
      options.release,
      "us",
      manifest.jurisdiction.code.toLowerCase(),
    );
    for (const object of manifest.objects) {
      const existing = await inspectLocalFile(
        path.join(stateRoot, object.partitionId, object.file),
      );
      if (!existing.exists || existing.sizeBytes !== object.sizeBytes) {
        missingBytes += object.sizeBytes;
      }
    }
  }
  const stats = await fs.statfs(options.targetRoot);
  const availableBytes = Number(stats.bavail) * Number(stats.bsize);
  const requiredBytes = missingBytes + (options.minimumFreeBytes ?? 0);
  if (availableBytes < requiredBytes) {
    throw new Error(
      `Restore target has ${availableBytes} bytes free; ${requiredBytes} bytes are required.`,
    );
  }
}

function summarizeCheckpoints(checkpoints: StateArchiveCheckpoint[]) {
  return {
    jurisdictionCount: checkpoints.length,
    partitionCount: checkpoints.reduce(
      (total, checkpoint) => total + checkpoint.archive.partitionCount,
      0,
    ),
    objectCount: checkpoints.reduce(
      (total, checkpoint) => total + checkpoint.archive.objectCount,
      0,
    ),
    storedBytes: checkpoints.reduce(
      (total, checkpoint) => total + checkpoint.archive.storedBytes,
      0,
    ),
    buildingCount: checkpoints.reduce(
      (total, checkpoint) => total + checkpoint.dataset.buildingCount,
      0,
    ),
  };
}

function groupObjectsByPartition(objects: ArchiveObject[]) {
  const groups = new Map<string, ArchiveObject[]>();
  for (const object of objects) {
    const group = groups.get(object.partitionId) ?? [];
    group.push(object);
    groups.set(object.partitionId, group);
  }
  return groups;
}

function parseRestoreReceipt(value: unknown): StateRestoreReceipt {
  const receipt = value as Partial<StateRestoreReceipt>;
  if (
    !value ||
    typeof value !== "object" ||
    receipt.format !== "comfortos-state-restore-receipt-v1" ||
    !receipt.release ||
    !receipt.jurisdiction ||
    !/^[A-Z]{2}$/.test(receipt.jurisdiction.code) ||
    !receipt.source ||
    !receipt.stateManifestKey ||
    !receipt.stateManifestSha256 ||
    !Number.isSafeInteger(receipt.partitionCount) ||
    !Number.isSafeInteger(receipt.objectCount) ||
    !Number.isSafeInteger(receipt.storedBytes) ||
    !receipt.restoredAt ||
    !Number.isFinite(Date.parse(receipt.restoredAt))
  ) {
    throw new Error("Invalid state restore receipt.");
  }
  return receipt as StateRestoreReceipt;
}

async function readOptionalRestoreReceipt(filePath: string) {
  try {
    return parseRestoreReceipt(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

async function writeImmutableBuffer(
  filePath: string,
  bytes: Buffer,
  expectedSha256: string,
) {
  if (sha256Buffer(bytes) !== expectedSha256) {
    throw new Error(`Immutable buffer checksum mismatch: ${filePath}`);
  }
  const existing = await inspectLocalFile(filePath);
  if (existing.exists) {
    if (
      existing.sizeBytes !== bytes.byteLength ||
      (await sha256File(filePath)) !== expectedSha256
    ) {
      throw new Error(`Immutable local file conflict: ${filePath}`);
    }
    return;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.rm(temporaryPath, { force: true });
  await fs.writeFile(temporaryPath, bytes, { flag: "wx" });
  await fs.rename(temporaryPath, filePath);
}

async function inspectLocalFile(filePath: string) {
  try {
    const stats = await fs.stat(filePath);
    return { exists: stats.isFile(), sizeBytes: stats.size };
  } catch (error) {
    if (isMissingFile(error)) return { exists: false as const };
    throw error;
  }
}

async function resolveStates(value: string, checkpointRoot: string, release: string) {
  if (value !== "all") {
    const states = Array.from(
      new Set(value.split(",").map((state) => state.trim().toUpperCase()).filter(Boolean)),
    ).sort();
    if (!states.length || states.some((state) => !/^[A-Z]{2}$/.test(state))) {
      throw new Error("--states must be 'all' or comma-separated two-letter codes.");
    }
    return states;
  }
  const directory = path.join(checkpointRoot, release);
  const states = (await fs.readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^[a-z]{2}\.json$/.test(entry.name))
    .map((entry) => entry.name.slice(0, 2).toUpperCase())
    .sort();
  if (states.length !== 51) {
    throw new Error(`--states all requires exactly 51 checkpoints; found ${states.length}.`);
  }
  return states;
}

async function loadRestoreEnvironment(explicitPath: string | undefined) {
  const envPath = path.resolve(explicitPath ?? ".env.local");
  try {
    await fs.access(envPath);
    loadEnvFile(envPath);
  } catch (error) {
    if (explicitPath || !isMissingFile(error)) throw error;
  }
}

function createConfiguredObjectStore(args: Record<string, string>) {
  const provider = requireOption(args.provider, "--provider");
  if (provider === "filesystem") {
    return createFilesystemObjectStore(
      path.resolve(requireOption(args.archiveRoot, "--archive-root")),
    );
  }
  if (provider !== "r2") throw new Error("--provider must be 'r2' or 'filesystem'.");
  return createR2ObjectStore({
    accountId: requireEnvironment("R2_ACCOUNT_ID"),
    accessKeyId: requireEnvironment("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnvironment("R2_SECRET_ACCESS_KEY"),
    bucket: args.bucket ?? requireEnvironment("R2_BUCKET"),
  });
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

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function sha256Buffer(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function assertRestoreOptions(options: ReleaseRestoreOptions) {
  requirePinnedRelease(options.release);
  if (!options.states.length || options.states.some((state) => !/^[A-Z]{2}$/.test(state))) {
    throw new Error("At least one valid state code is required.");
  }
  normalizePrefix(options.prefix);
}

function normalizePrefix(value: string) {
  const prefix = value.replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.split("/").includes("..")) {
    throw new Error("--prefix must be a safe, non-empty object prefix.");
  }
  return prefix;
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

function parseNonNegativeInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("--minimum-free-bytes must be a non-negative integer.");
  }
  return parsed;
}

function requirePinnedRelease(value: string | undefined) {
  const release = requireOption(value, "--release");
  if (release === "latest" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(release)) {
    throw new Error("--release must be a safe, pinned release.");
  }
  return release;
}

function requireEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for archive restoration.`);
  return value;
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

if (process.argv[1]?.endsWith("restore-us-overture-release.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
