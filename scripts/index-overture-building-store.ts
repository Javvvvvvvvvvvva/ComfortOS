import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { LocalOvertureStoreManifest } from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";

const BUILDINGS_FILE = "buildings.jsonl";
const MANIFEST_FILE = "manifest.json";
const OFFSETS_FILE = "building-offsets.bin";
const RECORD_SIZE = 12;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const storeDir = path.resolve(requireOption(options.store, "--store"));
  const result = await indexOvertureBuildingStore(storeDir);
  console.log(JSON.stringify(result, null, 2));
}

export async function indexOvertureBuildingStore(storeDir: string) {
  const manifestPath = path.join(storeDir, MANIFEST_FILE);
  const manifest = JSON.parse(
    await fs.readFile(manifestPath, "utf8"),
  ) as LocalOvertureStoreManifest;
  if (manifest.format !== "comfortos-local-building-store-v1") {
    throw new Error("Unsupported local Overture building store.");
  }

  const offsets = await createOffsets(
    path.join(storeDir, BUILDINGS_FILE),
    manifest.buildingCount,
  );
  const indexedAt = new Date().toISOString();
  const nextManifest: LocalOvertureStoreManifest = {
    ...manifest,
    indexedAt,
    randomAccessIndex: {
      file: OFFSETS_FILE,
      format: "uint64le-offset-uint32le-length-v1",
      recordSizeBytes: RECORD_SIZE,
    },
    checksums: {
      ...manifest.checksums,
      buildingsSha256:
        manifest.checksums?.buildingsSha256 ??
        (await sha256File(path.join(storeDir, BUILDINGS_FILE))),
      tileIndexSha256:
        manifest.checksums?.tileIndexSha256 ??
        (await sha256File(path.join(storeDir, "tile-index.json"))),
      buildingOffsetsSha256: sha256(offsets),
    },
  };

  const offsetsTemporaryPath = path.join(storeDir, `${OFFSETS_FILE}.tmp`);
  const manifestTemporaryPath = path.join(storeDir, `${MANIFEST_FILE}.tmp`);
  await fs.writeFile(offsetsTemporaryPath, offsets);
  await fs.writeFile(
    manifestTemporaryPath,
    `${JSON.stringify(nextManifest, null, 2)}\n`,
    "utf8",
  );
  await fs.rename(offsetsTemporaryPath, path.join(storeDir, OFFSETS_FILE));
  await fs.rename(manifestTemporaryPath, manifestPath);

  return {
    storeDir,
    region: manifest.region,
    buildingCount: manifest.buildingCount,
    offsetIndexBytes: offsets.length,
    indexedAt,
  };
}

async function createOffsets(buildingsPath: string, expectedCount: number) {
  const offsets = Buffer.alloc(expectedCount * RECORD_SIZE);
  let carry = Buffer.alloc(0);
  let processedBytes = 0;
  let recordCount = 0;

  for await (const chunk of createReadStream(buildingsPath)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const data = carry.length ? Buffer.concat([carry, bytes]) : bytes;
    const dataStartOffset = processedBytes - carry.length;
    let lineStart = 0;
    let lineEnd = data.indexOf(0x0a, lineStart);

    while (lineEnd >= 0) {
      let byteLength = lineEnd - lineStart;
      if (byteLength > 0 && data[lineEnd - 1] === 0x0d) byteLength -= 1;
      if (byteLength > 0) {
        writeOffsetRecord(
          offsets,
          recordCount,
          dataStartOffset + lineStart,
          byteLength,
        );
        recordCount += 1;
      }
      lineStart = lineEnd + 1;
      lineEnd = data.indexOf(0x0a, lineStart);
    }

    carry = Buffer.from(data.subarray(lineStart));
    processedBytes += bytes.length;
  }

  if (carry.length > 0) {
    const byteLength = carry.at(-1) === 0x0d ? carry.length - 1 : carry.length;
    writeOffsetRecord(offsets, recordCount, processedBytes - carry.length, byteLength);
    recordCount += 1;
  }
  if (recordCount !== expectedCount) {
    throw new Error(
      `Building count mismatch while indexing: expected ${expectedCount}, found ${recordCount}.`,
    );
  }
  return offsets;
}

function writeOffsetRecord(
  offsets: Buffer,
  recordIndex: number,
  byteOffset: number,
  byteLength: number,
) {
  const recordOffset = recordIndex * RECORD_SIZE;
  if (
    recordOffset + RECORD_SIZE > offsets.length ||
    !Number.isSafeInteger(byteOffset) ||
    byteOffset < 0 ||
    !Number.isInteger(byteLength) ||
    byteLength <= 0 ||
    byteLength > 0xffffffff
  ) {
    throw new Error("Invalid building record while creating random-access index.");
  }
  offsets.writeBigUInt64LE(BigInt(byteOffset), recordOffset);
  offsets.writeUInt32LE(byteLength, recordOffset + 8);
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
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
    options[key.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value;
  }
  return options;
}

function requireOption(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

if (process.argv[1]?.endsWith("index-overture-building-store.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
