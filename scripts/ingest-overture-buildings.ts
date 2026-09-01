import fs from "node:fs/promises";
import path from "node:path";
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

const DEFAULT_TILE_SIZE_DEGREES = 0.005;

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

  const startedAt = performance.now();
  const buildings = (await readFeatures(inputPath))
    .flatMap((feature) => normalizeOvertureFeature(feature))
    .filter((building) => !bounds || intersectsBounds(building.bbox, bounds));
  const tileIndex = buildTileIndex(buildings, tileSizeDegrees);
  const manifest: LocalOvertureStoreManifest = {
    format: "comfortos-local-building-store-v1",
    source: "overture-buildings",
    provider: "Overture Maps",
    release: options.release,
    theme: "buildings",
    type: "building",
    bbox: bounds ? [bounds.west, bounds.south, bounds.east, bounds.north] : undefined,
    license: options.license,
    sourceUrl: options.sourceUrl,
    sourceAccessMethod: options.sourceAccessMethod,
    buildingPartCount: options.buildingPartCount ? Number(options.buildingPartCount) : undefined,
    invalidGeometryCount: options.invalidGeometryCount
      ? Number(options.invalidGeometryCount)
      : undefined,
    createdAt: new Date().toISOString(),
    region,
    tileSizeDegrees,
    buildingCount: buildings.length,
    explicitHeightCount: buildings.filter((building) => building.heightSource === "provider").length,
    floorDerivedHeightCount: buildings.filter((building) => building.heightSource === "floors-derived").length,
    unknownHeightCount: buildings.filter((building) => building.heightSource === "unknown").length,
  };

  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(outputDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    ),
    fs.writeFile(
      path.join(outputDir, "buildings.jsonl"),
      `${buildings.map((building) => JSON.stringify(building)).join("\n")}\n`,
      "utf8",
    ),
    fs.writeFile(
      path.join(outputDir, "tile-index.json"),
      `${JSON.stringify(tileIndex)}\n`,
      "utf8",
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        ...manifest,
        ingestionMs: Math.round(performance.now() - startedAt),
        outputDir,
      },
      null,
      2,
    ),
  );
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

async function readFeatures(inputPath: string): Promise<Feature[]> {
  const text = await fs.readFile(inputPath, "utf8");
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const root = asRecord(parsed);
      if (root.type === "FeatureCollection" && Array.isArray(root.features)) {
        return root.features.flatMap((feature) => {
          const normalized = asFeature(feature);
          return normalized ? [normalized] : [];
        });
      }
      const feature = asFeature(parsed);
      return feature ? [feature] : [];
    } catch {
      // GeoJSONSeq/NDJSON also starts with "{", but contains one feature per line.
    }
  }

  return trimmed.split("\n").flatMap((line) => {
    const feature = asFeature(JSON.parse(line) as unknown);
    return feature ? [feature] : [];
  });
}

function buildTileIndex(buildings: StoredBuilding[], tileSizeDegrees: number) {
  const index: Record<string, number[]> = {};

  buildings.forEach((building, buildingIndex) => {
    for (const tileKey of tileKeysForBounds(building.bbox, tileSizeDegrees)) {
      index[tileKey] ??= [];
      index[tileKey].push(buildingIndex);
    }
  });

  return index;
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
