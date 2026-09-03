import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs, { constants as fsConstants } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadEnvFile } from "node:process";
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const STORE_FILES = [
  "buildings.jsonl",
  "tile-index.json",
  "building-offsets.bin",
  "manifest.json",
] as const;

type StatePlan = {
  format: "comfortos-us-state-building-plan-v1";
  jurisdiction: { code: string; name: string };
  partitionCount: number;
  partitions: Array<{
    id: string;
    bbox: [number, number, number, number];
  }>;
};

type StoreManifest = {
  format: string;
  release: string;
  region: string;
  bbox: [number, number, number, number];
  buildingCount: number;
  explicitHeightCount: number;
  floorDerivedHeightCount: number;
  unknownHeightCount: number;
  invalidGeometryCount: number;
  randomAccessIndex?: {
    file?: string;
    format?: string;
    recordSizeBytes?: number;
  };
  checksums?: {
    buildingsSha256?: string;
    tileIndexSha256?: string;
    buildingOffsetsSha256?: string;
  };
};

type ValidationReport = {
  createdAt: string;
  controlledWeather: string | null;
  routingProvider?: { id?: string; mode?: string; endpointFamily?: string };
  buildingProviderMode?: string;
  summary?: {
    routeCount?: number;
    successCount?: number;
    failureCount?: number;
    buildingQuerySuccessCount?: number;
    comparableRouteCount?: number;
    averageElapsedMs?: number | null;
    accepted?: boolean;
  };
  rows?: Array<{ id?: string }>;
};

export type ValidationEvidence = {
  kind: string;
  createdAt: string;
  reportFile: string;
  reportSha256: string;
  routingProvider: {
    id: string;
    mode: "managed";
    endpointFamily: string;
  };
  buildingProviderMode: "http-overture";
  routeCount: number;
  averageElapsedMs: number | null;
};

export type ArchiveObject = {
  partitionId: string;
  file: (typeof STORE_FILES)[number];
  key: string;
  sizeBytes: number;
  sha256: string;
};

export type StateArchiveManifest = {
  format: "comfortos-us-state-overture-archive-v1";
  createdAt: string;
  release: string;
  jurisdiction: { code: string; name: string };
  source: "overture-buildings";
  partitionCount: number;
  objectCount: number;
  storedBytes: number;
  dataset: {
    buildingCount: number;
    usableHeightCount: number;
    usableHeightRatio: number | null;
  };
  validation: ValidationEvidence[];
  objects: ArchiveObject[];
};

export type StateArchiveCheckpoint = {
  format: "comfortos-us-state-archive-checkpoint-v1";
  createdAt: string;
  release: string;
  jurisdiction: { code: string; name: string };
  validation: ValidationEvidence[];
  dataset: StateArchiveManifest["dataset"];
  archive: {
    provider: string;
    location: string;
    prefix: string;
    stateManifestKey: string;
    stateManifestSha256: string;
    partitionCount: number;
    objectCount: number;
    storedBytes: number;
    remoteVerified: true;
  };
  localDataPruned: boolean;
};

export type StateArchiveOptions = {
  state: string;
  release: string;
  planRoot: string;
  dataRoot: string;
  validationReports: string[];
  prefix: string;
  checkpointRoot: string;
  prune: boolean;
  confirmPrune?: string;
  dryRun: boolean;
};

type RemoteInspection = {
  exists: boolean;
  sizeBytes?: number;
  sha256?: string;
};

export interface ObjectStore {
  provider: string;
  location: string;
  inspect(key: string): Promise<RemoteInspection>;
  putFile(key: string, filePath: string, object: { sizeBytes: number; sha256: string }): Promise<void>;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadArchiveEnvironment(args.envFile);
  const state = requireOption(args.state, "--state").toUpperCase();
  assertStateCode(state);
  const release = requirePinnedRelease(args.release);
  const dryRun = args.dryRun === "true";
  const options: StateArchiveOptions = {
    state,
    release,
    planRoot: path.resolve(requireOption(args.planRoot, "--plan-root")),
    dataRoot: path.resolve(requireOption(args.dataRoot, "--data-root")),
    validationReports: requireOption(
      args.validationReports,
      "--validation-reports",
    )
      .split(",")
      .map((value) => path.resolve(value.trim()))
      .filter(Boolean),
    prefix: normalizePrefix(args.prefix ?? "overture-buildings"),
    checkpointRoot: path.resolve(
      args.checkpointRoot ?? "config/data-regions/archive-checkpoints",
    ),
    prune: args.prune === "true",
    confirmPrune: args.confirmPrune,
    dryRun,
  };
  const store = dryRun ? undefined : createConfiguredObjectStore(args);
  const result = await archiveState(options, store);
  console.log(JSON.stringify(result, null, 2));
}

async function loadArchiveEnvironment(explicitPath: string | undefined) {
  const envPath = path.resolve(explicitPath ?? ".env.local");
  try {
    await fs.access(envPath);
    loadEnvFile(envPath);
  } catch (error) {
    if (explicitPath || !isMissingFile(error)) throw error;
  }
}

export async function archiveState(
  options: StateArchiveOptions,
  store?: ObjectStore,
) {
  assertStateCode(options.state);
  const plan = await readStatePlan(options.planRoot, options.state);
  if (plan.jurisdiction.code !== options.state) {
    throw new Error(
      `State plan mismatch: expected ${options.state}, found ${plan.jurisdiction.code}.`,
    );
  }
  const validation = await validateReports(
    options.validationReports,
    options.state,
  );
  const stateDataRoot = path.join(
    options.dataRoot,
    options.state.toLowerCase(),
    options.release,
  );
  const { objects, dataset } = await collectArchiveObjects(
    plan,
    stateDataRoot,
    options.release,
    options.prefix,
  );
  const storedBytes = objects.reduce((total, object) => total + object.sizeBytes, 0);
  const createdAt = validation
    .map((report) => report.createdAt)
    .sort()
    .at(-1)!;
  const manifest: StateArchiveManifest = {
    format: "comfortos-us-state-overture-archive-v1",
    createdAt,
    release: options.release,
    jurisdiction: plan.jurisdiction,
    source: "overture-buildings",
    partitionCount: plan.partitionCount,
    objectCount: objects.length,
    storedBytes,
    dataset,
    validation,
    objects,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const stateManifestSha256 = sha256Buffer(Buffer.from(manifestText));
  const stateManifestKey = archiveKey(
    options.prefix,
    options.release,
    options.state,
    "state-archive-manifest.json",
  );

  if (options.dryRun) {
    return {
      dryRun: true,
      jurisdiction: plan.jurisdiction,
      release: options.release,
      partitionCount: plan.partitionCount,
      objectCount: objects.length,
      storedBytes,
      dataset,
      validationReportCount: validation.length,
      stateManifestKey,
      stateManifestSha256,
      localDataPruned: false,
    };
  }
  if (!store) throw new Error("An object store is required outside dry-run mode.");
  assertPruneConfirmation(options);

  const existingManifest = await store.inspect(stateManifestKey);
  let uploadedObjectCount = 0;
  let reusedObjectCount = 0;
  if (existingManifest.exists) {
    assertRemoteMatch(stateManifestKey, existingManifest, {
      sizeBytes: Buffer.byteLength(manifestText),
      sha256: stateManifestSha256,
    });
    reusedObjectCount = objects.length + 1;
  } else {
    for (const object of objects) {
      const localPath = path.join(
        stateDataRoot,
        object.partitionId,
        object.file,
      );
      const result = await syncObject(store, object.key, localPath, object);
      if (result === "uploaded") uploadedObjectCount += 1;
      else reusedObjectCount += 1;
    }
    const temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "comfortos-state-archive-"),
    );
    try {
      const temporaryManifest = path.join(
        temporaryDirectory,
        "state-archive-manifest.json",
      );
      await fs.writeFile(temporaryManifest, manifestText, "utf8");
      const result = await syncObject(
        store,
        stateManifestKey,
        temporaryManifest,
        {
          sizeBytes: Buffer.byteLength(manifestText),
          sha256: stateManifestSha256,
        },
      );
      if (result === "uploaded") uploadedObjectCount += 1;
      else reusedObjectCount += 1;
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  const checkpointPath = path.join(
    options.checkpointRoot,
    options.release,
    `${options.state.toLowerCase()}.json`,
  );
  const checkpoint: StateArchiveCheckpoint = {
    format: "comfortos-us-state-archive-checkpoint-v1",
    createdAt,
    release: options.release,
    jurisdiction: plan.jurisdiction,
    validation,
    dataset,
    archive: {
      provider: store.provider,
      location: store.location,
      prefix: options.prefix,
      stateManifestKey,
      stateManifestSha256,
      partitionCount: plan.partitionCount,
      objectCount: objects.length,
      storedBytes,
      remoteVerified: true,
    },
    localDataPruned: false,
  };
  await writeJsonAtomic(checkpointPath, checkpoint);

  if (options.prune) {
    const quarantinePath = `${stateDataRoot}.prune-${process.pid}`;
    await fs.rm(quarantinePath, { recursive: true, force: true });
    await fs.rename(stateDataRoot, quarantinePath);
    checkpoint.localDataPruned = true;
    await writeJsonAtomic(checkpointPath, checkpoint);
    await fs.rm(quarantinePath, { recursive: true });
  }

  return {
    dryRun: false,
    jurisdiction: plan.jurisdiction,
    release: options.release,
    partitionCount: plan.partitionCount,
    objectCount: objects.length + 1,
    storedBytes,
    uploadedObjectCount,
    reusedObjectCount,
    stateManifestKey,
    stateManifestSha256,
    checkpointPath,
    localDataPruned: checkpoint.localDataPruned,
  };
}

export async function validateReports(reportPaths: string[], state: string) {
  if (reportPaths.length < 2) {
    throw new Error("At least two validation reports are required.");
  }
  const evidence: ValidationEvidence[] = [];
  for (const reportPath of reportPaths) {
    const content = await fs.readFile(reportPath);
    const report = JSON.parse(content.toString("utf8")) as ValidationReport;
    const summary = report.summary;
    const routingProvider = report.routingProvider;
    if (!summary || !routingProvider) {
      throw new Error(`Validation report was not accepted: ${reportPath}`);
    }
    const routeCount = summary.routeCount ?? 0;
    const statePrefix = `${state.toLowerCase()}-`;
    const accepted =
      summary.accepted === true &&
      routeCount > 0 &&
      summary.successCount === routeCount &&
      summary.failureCount === 0 &&
      summary.buildingQuerySuccessCount === routeCount &&
      summary.comparableRouteCount === routeCount &&
      routingProvider.mode === "managed" &&
      report.buildingProviderMode === "http-overture" &&
      report.rows?.length === routeCount &&
      report.rows.every((row) => row.id?.startsWith(statePrefix));
    if (!accepted) {
      throw new Error(`Validation report was not accepted: ${reportPath}`);
    }
    if (!Number.isFinite(Date.parse(report.createdAt))) {
      throw new Error(`Validation report has an invalid createdAt: ${reportPath}`);
    }
    evidence.push({
      kind: report.controlledWeather ?? "live",
      createdAt: report.createdAt,
      reportFile: `${state.toLowerCase()}-${report.controlledWeather ?? "live"}-validation.json`,
      reportSha256: sha256Buffer(content),
      routingProvider: {
        id: routingProvider.id ?? "unknown",
        mode: "managed",
        endpointFamily: routingProvider.endpointFamily ?? "unknown",
      },
      buildingProviderMode: "http-overture",
      routeCount,
      averageElapsedMs: summary.averageElapsedMs ?? null,
    });
  }
  if (!evidence.some((item) => item.kind === "live")) {
    throw new Error("A live-weather validation report is required.");
  }
  if (!evidence.some((item) => item.kind !== "live")) {
    throw new Error("A controlled-weather validation report is required.");
  }
  return evidence.sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.reportSha256.localeCompare(right.reportSha256),
  );
}

export async function collectArchiveObjects(
  plan: StatePlan,
  stateDataRoot: string,
  release: string,
  prefix: string,
) {
  const objects: ArchiveObject[] = [];
  let buildingCount = 0;
  let usableHeightCount = 0;
  for (const partition of plan.partitions) {
    const partitionRoot = path.join(stateDataRoot, partition.id);
    const manifestPath = path.join(partitionRoot, "manifest.json");
    const manifest = JSON.parse(
      await fs.readFile(manifestPath, "utf8"),
    ) as StoreManifest;
    if (
      manifest.format !== "comfortos-local-building-store-v1" ||
      manifest.release !== release ||
      manifest.region !== partition.id ||
      !sameBounds(manifest.bbox, partition.bbox)
    ) {
      throw new Error(`Invalid partition manifest: ${manifestPath}`);
    }
    if (
      !Number.isInteger(manifest.buildingCount) ||
      manifest.buildingCount < 0 ||
      !Number.isInteger(manifest.explicitHeightCount) ||
      manifest.explicitHeightCount < 0 ||
      !Number.isInteger(manifest.floorDerivedHeightCount) ||
      manifest.floorDerivedHeightCount < 0 ||
      !Number.isInteger(manifest.unknownHeightCount) ||
      manifest.unknownHeightCount < 0 ||
      manifest.explicitHeightCount +
          manifest.floorDerivedHeightCount +
          manifest.unknownHeightCount !==
        manifest.buildingCount ||
      !Number.isInteger(manifest.invalidGeometryCount) ||
      manifest.invalidGeometryCount < 0 ||
      manifest.randomAccessIndex?.file !== "building-offsets.bin" ||
      manifest.randomAccessIndex.format !==
        "uint64le-offset-uint32le-length-v1" ||
      manifest.randomAccessIndex.recordSizeBytes !== 12
    ) {
      throw new Error(`Invalid partition counts: ${manifestPath}`);
    }
    buildingCount += manifest.buildingCount;
    usableHeightCount +=
      manifest.explicitHeightCount + manifest.floorDerivedHeightCount;
    const expectedChecksums: Record<string, string | undefined> = {
      "buildings.jsonl": manifest.checksums?.buildingsSha256,
      "tile-index.json": manifest.checksums?.tileIndexSha256,
      "building-offsets.bin": manifest.checksums?.buildingOffsetsSha256,
    };
    for (const file of STORE_FILES) {
      const filePath = path.join(partitionRoot, file);
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) throw new Error(`Archive source is not a file: ${filePath}`);
      if (
        file === "building-offsets.bin" &&
        stats.size !== manifest.buildingCount * 12
      ) {
        throw new Error(`Random-access index length mismatch: ${filePath}`);
      }
      const sha256 = await sha256File(filePath);
      const expected = expectedChecksums[file];
      if (file !== "manifest.json" && (!expected || expected !== sha256)) {
        throw new Error(`Local checksum mismatch: ${filePath}`);
      }
      objects.push({
        partitionId: partition.id,
        file,
        key: archiveKey(prefix, release, plan.jurisdiction.code, partition.id, file),
        sizeBytes: stats.size,
        sha256,
      });
    }
  }
  if (objects.length !== plan.partitionCount * STORE_FILES.length) {
    throw new Error("The state archive is incomplete.");
  }
  return {
    objects,
    dataset: {
      buildingCount,
      usableHeightCount,
      usableHeightRatio:
        buildingCount > 0 ? usableHeightCount / buildingCount : null,
    },
  };
}

export function createFilesystemObjectStore(root: string): ObjectStore {
  const resolvedRoot = path.resolve(root);
  return {
    provider: "filesystem",
    location: resolvedRoot,
    async inspect(key) {
      const target = safeObjectPath(resolvedRoot, key);
      try {
        const stats = await fs.stat(target);
        return {
          exists: true,
          sizeBytes: stats.size,
          sha256: await sha256File(target),
        };
      } catch (error) {
        if (isMissingFile(error)) return { exists: false };
        throw error;
      }
    },
    async putFile(key, filePath) {
      const target = safeObjectPath(resolvedRoot, key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(filePath, target, fsConstants.COPYFILE_EXCL);
    },
  };
}

export function createR2ObjectStore(options: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): ObjectStore {
  const clientConfig: S3ClientConfig = {
    region: "auto",
    endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  };
  const client = new S3Client(clientConfig);
  return {
    provider: "cloudflare-r2",
    location: options.bucket,
    async inspect(key) {
      try {
        const head = await client.send(
          new HeadObjectCommand({ Bucket: options.bucket, Key: key }),
        );
        const body = await client.send(
          new GetObjectCommand({ Bucket: options.bucket, Key: key }),
        );
        if (!body.Body) throw new Error(`R2 object returned no body: ${key}`);
        const hash = createHash("sha256");
        let sizeBytes = 0;
        for await (const chunk of body.Body as AsyncIterable<Uint8Array>) {
          hash.update(chunk);
          sizeBytes += chunk.byteLength;
        }
        if (head.ContentLength !== undefined && head.ContentLength !== sizeBytes) {
          throw new Error(`R2 object length changed while verifying: ${key}`);
        }
        return { exists: true, sizeBytes, sha256: hash.digest("hex") };
      } catch (error) {
        if (isRemoteMissing(error)) return { exists: false };
        throw new Error(`R2 verification failed for ${key}.`, { cause: error });
      }
    },
    async putFile(key, filePath, object) {
      try {
        const upload = new Upload({
          client,
          params: {
            Bucket: options.bucket,
            Key: key,
            Body: createReadStream(filePath),
            ContentLength: object.sizeBytes,
            ContentType: contentType(filePath),
            Metadata: { sha256: object.sha256 },
          },
          queueSize: 2,
          partSize: 16 * 1024 * 1024,
          leavePartsOnError: false,
        });
        await upload.done();
      } catch (error) {
        throw new Error(`R2 upload failed for ${key}.`, { cause: error });
      }
    },
  };
}

async function syncObject(
  store: ObjectStore,
  key: string,
  filePath: string,
  object: { sizeBytes: number; sha256: string },
) {
  const existing = await store.inspect(key);
  if (existing.exists) {
    assertRemoteMatch(key, existing, object);
    return "reused" as const;
  }
  await store.putFile(key, filePath, object);
  const uploaded = await store.inspect(key);
  assertRemoteMatch(key, uploaded, object);
  return "uploaded" as const;
}

function assertRemoteMatch(
  key: string,
  remote: RemoteInspection,
  expected: { sizeBytes: number; sha256: string },
) {
  if (
    !remote.exists ||
    remote.sizeBytes !== expected.sizeBytes ||
    remote.sha256 !== expected.sha256
  ) {
    throw new Error(`Immutable remote object conflict or verification failure: ${key}`);
  }
}

function createConfiguredObjectStore(args: Record<string, string>) {
  const provider = requireOption(args.provider, "--provider");
  if (provider === "filesystem") {
    return createFilesystemObjectStore(
      requireOption(args.archiveRoot, "--archive-root"),
    );
  }
  if (provider !== "r2") {
    throw new Error("--provider must be 'r2' or 'filesystem'.");
  }
  return createR2ObjectStore({
    accountId: requireEnvironment("R2_ACCOUNT_ID"),
    accessKeyId: requireEnvironment("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnvironment("R2_SECRET_ACCESS_KEY"),
    bucket: args.bucket ?? requireEnvironment("R2_BUCKET"),
  });
}

async function readStatePlan(planRoot: string, state: string) {
  const planPath = path.join(planRoot, state.toLowerCase(), "state-plan.json");
  const plan = JSON.parse(await fs.readFile(planPath, "utf8")) as StatePlan;
  if (plan.format !== "comfortos-us-state-building-plan-v1") {
    throw new Error(`Unsupported state plan: ${planPath}`);
  }
  if (plan.partitionCount !== plan.partitions.length) {
    throw new Error(`State plan partition count mismatch: ${planPath}`);
  }
  if (plan.partitions.some((partition) => !/^[a-z0-9-]+$/.test(partition.id))) {
    throw new Error(`State plan contains an unsafe partition id: ${planPath}`);
  }
  return plan;
}

function assertStateCode(state: string) {
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error("--state must be a two-letter jurisdiction code.");
  }
}

function assertPruneConfirmation(options: StateArchiveOptions) {
  if (!options.prune) return;
  const expected = `${options.state}@${options.release}`;
  if (options.confirmPrune !== expected) {
    throw new Error(`--confirm-prune must be exactly '${expected}'.`);
  }
}

function archiveKey(prefix: string, release: string, state: string, ...parts: string[]) {
  return path.posix.join(
    prefix,
    release,
    "us",
    state.toLowerCase(),
    ...parts,
  );
}

function normalizePrefix(value: string) {
  const prefix = value.replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.split("/").includes("..")) {
    throw new Error("--prefix must be a safe, non-empty object prefix.");
  }
  return prefix;
}

function safeObjectPath(root: string, key: string) {
  const target = path.resolve(root, ...key.split("/"));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Unsafe object key: ${key}`);
  }
  return target;
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function sameBounds(
  left: [number, number, number, number] | undefined,
  right: [number, number, number, number],
) {
  return Boolean(left?.every((value, index) => value === right[index]));
}

function contentType(filePath: string) {
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".jsonl")) return "application/x-ndjson";
  return "application/octet-stream";
}

function isMissingFile(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isRemoteMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.Code === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

function requirePinnedRelease(value: string | undefined) {
  const release = requireOption(value, "--release");
  if (release === "latest") throw new Error("--release must be pinned.");
  return release;
}

function requireEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for R2 archival.`);
  return value;
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

function requireOption(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

if (process.argv[1]?.endsWith("archive-us-state-overture.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
