import fs from "node:fs/promises";
import { createReadStream, createWriteStream, type WriteStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { createInterface } from "node:readline";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { normalizeBuildingHeight } from "@/lib/environment/buildings/height";
import type { BoundingBox, Building } from "@/lib/environment/buildings/types";
import {
  boundsForFootprint,
  tileKeysForBounds,
  type LocalOvertureStoreManifest,
} from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";

type JsonRecord = Record<string, unknown>;
type StoredBuilding = Building & { bbox: BoundingBox };
type IngestOptions = {
  inputPath: string;
  outputDir: string;
  region: string;
  bounds: BoundingBox | null;
  tileSizeDegrees: number;
  release?: string;
  license?: string;
  sourceUrl?: string;
  sourceAccessMethod?: string;
  buildingPartCount?: number;
  invalidGeometryCount?: number;
};

const DEFAULT_TILE_SIZE_DEGREES = 0.005;
const BUILDING_OFFSETS_FILE = "building-offsets.bin";
const BUILDING_OFFSET_RECORD_SIZE = 12;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = requireOption(options.input, "--input");
  const outputDir = requireOption(options.output, "--output");
  const region = options.region ?? "minneapolis";
  const bounds = options.bounds ? parseBounds(options.bounds) : null;
  const tileSizeDegrees = options.tileSizeDegrees
    ? Number(options.tileSizeDegrees)
    : DEFAULT_TILE_SIZE_DEGREES;

  if (!Number.isFinite(tileSizeDegrees) || tileSizeDegrees <= 0) {
    throw new Error("--tile-size-degrees must be a positive number.");
  }

  const result = await ingestOvertureBuildingFile({
    inputPath,
    outputDir,
    region,
    bounds,
    tileSizeDegrees,
    release: options.release,
    license: options.license,
    sourceUrl: options.sourceUrl,
    sourceAccessMethod: options.sourceAccessMethod,
    buildingPartCount: options.buildingPartCount
      ? Number(options.buildingPartCount)
      : undefined,
    invalidGeometryCount: options.invalidGeometryCount
      ? Number(options.invalidGeometryCount)
      : undefined,
  });

  console.log(
    JSON.stringify(
      {
        ...result.manifest,
        ingestionMs: result.ingestionMs,
        outputDir,
      },
      null,
      2,
    ),
  );
}

export async function ingestOvertureBuildingFile(options: IngestOptions) {
  const startedAt = performance.now();
  const suffix = `.tmp-${process.pid}-${Date.now()}`;
  const buildingsPath = path.join(options.outputDir, "buildings.jsonl");
  const offsetsPath = path.join(options.outputDir, BUILDING_OFFSETS_FILE);
  const tileIndexPath = path.join(options.outputDir, "tile-index.json");
  const manifestPath = path.join(options.outputDir, "manifest.json");
  const buildingsTempPath = `${buildingsPath}${suffix}`;
  const offsetsTempPath = `${offsetsPath}${suffix}`;
  const tileIndexTempPath = `${tileIndexPath}${suffix}`;
  const manifestTempPath = `${manifestPath}${suffix}`;
  const tempPaths = [
    buildingsTempPath,
    offsetsTempPath,
    tileIndexTempPath,
    manifestTempPath,
  ];

  await fs.mkdir(options.outputDir, { recursive: true });
  const buildingsWriter = createWriteStream(buildingsTempPath);
  const offsetsWriter = createWriteStream(offsetsTempPath);
  const buildingsHash = createHash("sha256");
  const offsetsHash = createHash("sha256");
  const tileIndex: Record<string, number[]> = {};
  let buildingCount = 0;
  let explicitHeightCount = 0;
  let floorDerivedHeightCount = 0;
  let unknownHeightCount = 0;
  let byteOffset = 0;

  try {
    for await (const feature of iterateFeatures(options.inputPath)) {
      for (const building of normalizeOvertureFeature(feature)) {
        if (options.bounds && !intersectsBounds(building.bbox, options.bounds)) continue;

        const line = JSON.stringify(building);
        const byteLength = Buffer.byteLength(line, "utf8");
        const offsetRecord = Buffer.allocUnsafe(BUILDING_OFFSET_RECORD_SIZE);
        offsetRecord.writeBigUInt64LE(BigInt(byteOffset), 0);
        offsetRecord.writeUInt32LE(byteLength, 8);

        buildingsHash.update(line).update("\n");
        offsetsHash.update(offsetRecord);
        await Promise.all([
          writeChunk(buildingsWriter, `${line}\n`),
          writeChunk(offsetsWriter, offsetRecord),
        ]);

        for (const tileKey of tileKeysForBounds(building.bbox, options.tileSizeDegrees)) {
          tileIndex[tileKey] ??= [];
          tileIndex[tileKey].push(buildingCount);
        }

        buildingCount += 1;
        byteOffset += byteLength + 1;
        if (building.heightSource === "provider") explicitHeightCount += 1;
        else if (building.heightSource === "floors-derived") floorDerivedHeightCount += 1;
        else unknownHeightCount += 1;
      }
    }

    buildingsWriter.end();
    offsetsWriter.end();
    await Promise.all([finished(buildingsWriter), finished(offsetsWriter)]);

    const tileIndexText = `${JSON.stringify(tileIndex)}\n`;
    const timestamp = new Date().toISOString();
    const manifest: LocalOvertureStoreManifest = {
      format: "comfortos-local-building-store-v1",
      source: "overture-buildings",
      provider: "Overture Maps",
      release: options.release,
      theme: "buildings",
      type: "building",
      bbox: options.bounds
        ? [options.bounds.west, options.bounds.south, options.bounds.east, options.bounds.north]
        : undefined,
      license: options.license,
      sourceUrl: options.sourceUrl,
      sourceAccessMethod: options.sourceAccessMethod,
      buildingPartCount: options.buildingPartCount,
      invalidGeometryCount: options.invalidGeometryCount,
      createdAt: timestamp,
      region: options.region,
      tileSizeDegrees: options.tileSizeDegrees,
      buildingCount,
      explicitHeightCount,
      floorDerivedHeightCount,
      unknownHeightCount,
      indexedAt: timestamp,
      randomAccessIndex: {
        file: BUILDING_OFFSETS_FILE,
        format: "uint64le-offset-uint32le-length-v1",
        recordSizeBytes: BUILDING_OFFSET_RECORD_SIZE,
      },
      checksums: {
        buildingsSha256: buildingsHash.digest("hex"),
        tileIndexSha256: sha256(tileIndexText),
        buildingOffsetsSha256: offsetsHash.digest("hex"),
      },
    };

    await fs.writeFile(tileIndexTempPath, tileIndexText, "utf8");
    await Promise.all([
      fs.rename(buildingsTempPath, buildingsPath),
      fs.rename(offsetsTempPath, offsetsPath),
      fs.rename(tileIndexTempPath, tileIndexPath),
    ]);
    await fs.writeFile(manifestTempPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await fs.rename(manifestTempPath, manifestPath);

    return {
      manifest,
      ingestionMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    buildingsWriter.destroy();
    offsetsWriter.destroy();
    await Promise.allSettled(tempPaths.map((tempPath) => fs.rm(tempPath, { force: true })));
    throw error;
  }
}

async function writeChunk(stream: WriteStream, chunk: string | Buffer) {
  if (stream.write(chunk)) return;
  await once(stream, "drain");
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildBuildingOffsets(lines: string[]) {
  const offsets = Buffer.alloc(lines.length * BUILDING_OFFSET_RECORD_SIZE);
  let byteOffset = 0;

  lines.forEach((line, index) => {
    const byteLength = Buffer.byteLength(line, "utf8");
    const recordOffset = index * BUILDING_OFFSET_RECORD_SIZE;
    offsets.writeBigUInt64LE(BigInt(byteOffset), recordOffset);
    offsets.writeUInt32LE(byteLength, recordOffset + 8);
    byteOffset += byteLength + 1;
  });

  return offsets;
}

export function normalizeOvertureFeature(feature: Feature): StoredBuilding[] {
  const properties = asRecord(feature.properties);
  const geometry = normalizeFootprint(feature.geometry);
  if (!geometry) return [];

  const height = normalizeBuildingHeight({
    height:
      properties.height ??
      properties.height_m ??
      properties.height_meters,
    minHeight:
      properties.min_height ??
      properties.min_height_m ??
      properties.min_height_meters,
    floors:
      properties.num_floors ??
      properties.floors ??
      properties.levels,
    sourceConfidence: 0.82,
  });
  const id =
    asString(properties.id) ??
    asString(properties["@id"]) ??
    asString(feature.id) ??
    stableFeatureId(geometry);
  const building: StoredBuilding = {
    id: `overture:${id}`,
    footprint: geometry,
    bbox: boundsForFootprint(geometry),
    heightMeters: height.heightMeters,
    minHeightMeters: height.minHeightMeters,
    floors: height.floors,
    source: "Overture Maps Buildings",
    confidence: height.confidence,
    heightSource: height.heightSource,
  };

  return [building];
}

async function* iterateFeatures(inputPath: string): AsyncGenerator<Feature> {
  const handle = await fs.open(inputPath, "r");
  const prefixBuffer = Buffer.alloc(64 * 1024);
  const { bytesRead } = await handle.read(prefixBuffer, 0, prefixBuffer.length, 0);
  await handle.close();
  const prefix = prefixBuffer.subarray(0, bytesRead).toString("utf8").trimStart();
  if (!prefix) return;

  const firstLine = prefix.split(/\r?\n/, 1)[0]?.trim();
  const isDocument =
    firstLine === "{" || /"type"\s*:\s*"FeatureCollection"/.test(prefix);
  if (isDocument) {
    const parsed = JSON.parse(await fs.readFile(inputPath, "utf8")) as unknown;
    const root = asRecord(parsed);
    if (root.type === "FeatureCollection" && Array.isArray(root.features)) {
      for (const value of root.features) {
        const feature = asFeature(value);
        if (feature) yield feature;
      }
      return;
    }
    const feature = asFeature(parsed);
    if (feature) yield feature;
    return;
  }

  const input = createReadStream(inputPath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const line = trimmed.charCodeAt(0) === 0x1e ? trimmed.slice(1).trimStart() : trimmed;
    if (!line) continue;
    const feature = asFeature(JSON.parse(line) as unknown);
    if (feature) yield feature;
  }
}

function normalizeFootprint(geometry: unknown): Polygon | MultiPolygon | null {
  const record = asRecordOrNull(geometry);
  if (!record) return null;
  if (record.type === "Polygon" && isPolygonCoordinates(record.coordinates)) {
    return { type: "Polygon", coordinates: closePolygon(record.coordinates) };
  }
  if (record.type === "MultiPolygon" && isMultiPolygonCoordinates(record.coordinates)) {
    return {
      type: "MultiPolygon",
      coordinates: record.coordinates.map((polygon) => closePolygon(polygon)),
    };
  }

  return null;
}

function closePolygon(coordinates: Polygon["coordinates"]): Polygon["coordinates"] {
  return coordinates.flatMap((ring) => {
    if (ring.length < 3) return [];
    const first = ring[0];
    const last = ring[ring.length - 1];
    return [
      first[0] === last[0] && first[1] === last[1]
        ? ring
        : [...ring, first],
    ];
  });
}

function isPolygonCoordinates(value: unknown): value is Polygon["coordinates"] {
  return (
    Array.isArray(value) &&
    value.every(
      (ring) =>
        Array.isArray(ring) &&
        ring.length >= 3 &&
        ring.every(
          (coordinate) =>
            Array.isArray(coordinate) &&
            coordinate.length >= 2 &&
            typeof coordinate[0] === "number" &&
            typeof coordinate[1] === "number",
        ),
    )
  );
}

function isMultiPolygonCoordinates(value: unknown): value is MultiPolygon["coordinates"] {
  return Array.isArray(value) && value.every(isPolygonCoordinates);
}

function parseArgs(args: string[]) {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    }
    options[toCamelCase(key.slice(2))] = value;
  }
  return options;
}

function parseBounds(value: string): BoundingBox {
  const [west, south, east, north] = value.split(",").map(Number);
  if (![west, south, east, north].every(Number.isFinite)) {
    throw new Error("--bounds must be west,south,east,north.");
  }
  return { west, south, east, north };
}

function requireOption(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function intersectsBounds(left: BoundingBox, right: BoundingBox) {
  return !(
    left.east < right.west ||
    left.west > right.east ||
    left.north < right.south ||
    left.south > right.north
  );
}

function asFeature(value: unknown): Feature | null {
  const record = asRecordOrNull(value);
  if (!record || record.type !== "Feature" || !("geometry" in record)) return null;
  return record as unknown as Feature;
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonRecord;
}

function asRecordOrNull(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stableFeatureId(geometry: Polygon | MultiPolygon) {
  return Buffer.from(JSON.stringify(geometry.coordinates).slice(0, 128)).toString("base64url");
}

function toCamelCase(value: string) {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

if (process.argv[1]?.endsWith("ingest-overture-buildings.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
