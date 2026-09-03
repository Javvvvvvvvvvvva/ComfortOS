import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { MultiPolygon, Polygon } from "geojson";
import type {
  BoundingBox,
  Building,
  BuildingProviderMetadata,
  BuildingProvider,
} from "@/lib/environment/buildings/types";

export type LocalOvertureStoreManifest = {
  format: "comfortos-local-building-store-v1";
  source: "overture-buildings";
  provider?: "Overture Maps";
  release?: string;
  theme?: "buildings";
  type?: "building";
  bbox?: [number, number, number, number];
  license?: string;
  sourceUrl?: string;
  sourceAccessMethod?: string;
  buildingPartCount?: number;
  invalidGeometryCount?: number;
  createdAt: string;
  region: string;
  tileSizeDegrees: number;
  buildingCount: number;
  explicitHeightCount: number;
  floorDerivedHeightCount: number;
  unknownHeightCount: number;
  indexedAt?: string;
  randomAccessIndex?: {
    file: string;
    format: "uint64le-offset-uint32le-length-v1";
    recordSizeBytes: 12;
  };
  checksums?: {
    buildingsSha256: string;
    tileIndexSha256: string;
    buildingOffsetsSha256?: string;
  };
};

type TileIndex = Record<string, number[]>;

type StoredBuilding = Building & {
  bbox: BoundingBox;
};

type LoadedStore = {
  manifest: LocalOvertureStoreManifest;
  buildings: StoredBuilding[] | null;
  buildingOffsets: Buffer | null;
  tileIndex: TileIndex;
};

type LocalOvertureBuildingProviderOptions = {
  storeDir: string;
};

const MANIFEST_FILE = "manifest.json";
const BUILDINGS_FILE = "buildings.jsonl";
const TILE_INDEX_FILE = "tile-index.json";
const RANDOM_ACCESS_FORMAT = "uint64le-offset-uint32le-length-v1";
const RANDOM_ACCESS_RECORD_SIZE = 12;
const RANDOM_ACCESS_READ_CONCURRENCY = 32;
const MAX_STORED_BUILDING_BYTES = 16 * 1024 * 1024;

export class LocalOvertureBuildingProvider implements BuildingProvider {
  private readonly storeDir: string;
  private manifestPromise: Promise<LocalOvertureStoreManifest> | null = null;
  private loaded: LoadedStore | null = null;
  private loadPromise: Promise<LoadedStore> | null = null;

  constructor(options: LocalOvertureBuildingProviderOptions) {
    this.storeDir = options.storeDir;
  }

  async getBuildings(bounds: BoundingBox): Promise<Building[]> {
    const store = await this.loadStore();
    const candidateIndexes = new Set<number>();

    for (const tileKey of tileKeysForBounds(bounds, store.manifest.tileSizeDegrees)) {
      for (const index of store.tileIndex[tileKey] ?? []) {
        candidateIndexes.add(index);
      }
    }

    const candidateBuildings = store.buildingOffsets
      ? await this.readBuildingsByOffset(candidateIndexes, store.buildingOffsets)
      : [...candidateIndexes].flatMap((index) => {
          const building = store.buildings?.[index];
          return building ? [building] : [];
        });

    return candidateBuildings.flatMap((building) => {
      if (!building || !intersectsBounds(building.bbox, bounds)) return [];
      return [stripStoredBounds(building)];
    });
  }

  async getManifest() {
    if (!this.manifestPromise) {
      this.manifestPromise = fs
        .readFile(path.join(this.storeDir, MANIFEST_FILE), "utf8")
        .then((text) => {
          const manifest = JSON.parse(text) as LocalOvertureStoreManifest;
          if (manifest.format !== "comfortos-local-building-store-v1") {
            throw new Error("Unsupported local Overture building store.");
          }
          return manifest;
        })
        .catch((error) => {
          this.manifestPromise = null;
          throw error;
        });
    }
    return this.manifestPromise;
  }

  async getMetadata(): Promise<BuildingProviderMetadata> {
    const manifest = await this.getManifest();
    return {
      provider: manifest.provider,
      datasetVersion: manifest.release,
      generatedAt: manifest.createdAt,
      region: manifest.region,
      source: manifest.source,
    };
  }

  isLoaded() {
    return this.loaded !== null;
  }

  releaseStore() {
    this.loaded = null;
  }

  private async loadStore() {
    if (this.loaded) return this.loaded;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loadStoreFiles();

    try {
      return await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  private async loadStoreFiles(): Promise<LoadedStore> {
    const manifest = await this.getManifest();
    const tileIndexText = await fs.readFile(
      path.join(this.storeDir, TILE_INDEX_FILE),
      "utf8",
    );
    verifyStoreChecksum(
      "tile-index.json",
      tileIndexText,
      manifest.checksums?.tileIndexSha256,
    );

    if (manifest.randomAccessIndex) {
      assertRandomAccessIndex(manifest);
      await verifyStoreFileChecksum(
        path.join(this.storeDir, BUILDINGS_FILE),
        manifest.checksums?.buildingsSha256,
      );
      const buildingOffsets = await fs.readFile(
        path.join(this.storeDir, manifest.randomAccessIndex.file),
      );
      verifyStoreChecksum(
        manifest.randomAccessIndex.file,
        buildingOffsets,
        manifest.checksums?.buildingOffsetsSha256,
      );
      if (buildingOffsets.length !== manifest.buildingCount * RANDOM_ACCESS_RECORD_SIZE) {
        throw new Error("Overture building random-access index length is invalid.");
      }
      this.loaded = {
        manifest,
        buildings: null,
        buildingOffsets,
        tileIndex: JSON.parse(tileIndexText) as TileIndex,
      };
      return this.loaded;
    }

    const buildingsText = await fs.readFile(
      path.join(this.storeDir, BUILDINGS_FILE),
      "utf8",
    );
    verifyStoreChecksum(
      "buildings.jsonl",
      buildingsText,
      manifest.checksums?.buildingsSha256,
    );
    this.loaded = {
      manifest,
      buildings: buildingsText
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as StoredBuilding),
      buildingOffsets: null,
      tileIndex: JSON.parse(tileIndexText) as TileIndex,
    };
    return this.loaded;
  }

  private async readBuildingsByOffset(
    candidateIndexes: Set<number>,
    buildingOffsets: Buffer,
  ) {
    const file = await fs.open(path.join(this.storeDir, BUILDINGS_FILE), "r");
    const buildings: StoredBuilding[] = [];
    const indexes = [...candidateIndexes].sort((left, right) => left - right);

    try {
      for (
        let offset = 0;
        offset < indexes.length;
        offset += RANDOM_ACCESS_READ_CONCURRENCY
      ) {
        const batch = indexes.slice(offset, offset + RANDOM_ACCESS_READ_CONCURRENCY);
        buildings.push(
          ...(await Promise.all(
            batch.map((index) => readStoredBuilding(file, buildingOffsets, index)),
          )),
        );
      }
      return buildings;
    } finally {
      await file.close();
    }
  }
}

async function readStoredBuilding(
  file: Awaited<ReturnType<typeof fs.open>>,
  buildingOffsets: Buffer,
  index: number,
) {
  const recordOffset = index * RANDOM_ACCESS_RECORD_SIZE;
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    recordOffset + RANDOM_ACCESS_RECORD_SIZE > buildingOffsets.length
  ) {
    throw new Error("Overture building random-access index contains an invalid record.");
  }

  const position = buildingOffsets.readBigUInt64LE(recordOffset);
  const byteLength = buildingOffsets.readUInt32LE(recordOffset + 8);
  if (
    position > BigInt(Number.MAX_SAFE_INTEGER) ||
    byteLength === 0 ||
    byteLength > MAX_STORED_BUILDING_BYTES
  ) {
    throw new Error("Overture building random-access record is invalid.");
  }

  const buffer = Buffer.allocUnsafe(byteLength);
  const { bytesRead } = await file.read(buffer, 0, byteLength, Number(position));
  if (bytesRead !== byteLength) {
    throw new Error("Overture building random-access read was incomplete.");
  }
  return JSON.parse(buffer.toString("utf8")) as StoredBuilding;
}

function assertRandomAccessIndex(manifest: LocalOvertureStoreManifest) {
  const index = manifest.randomAccessIndex;
  if (
    !index ||
    index.format !== RANDOM_ACCESS_FORMAT ||
    index.recordSizeBytes !== RANDOM_ACCESS_RECORD_SIZE ||
    path.basename(index.file) !== index.file
  ) {
    throw new Error("Unsupported Overture building random-access index.");
  }
}

function verifyStoreChecksum(
  name: string,
  content: string | Buffer,
  expected?: string,
) {
  if (!expected) return;
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== expected) {
    throw new Error(`Overture building store checksum mismatch for ${name}.`);
  }
}

async function verifyStoreFileChecksum(filePath: string, expected?: string) {
  if (!expected) return;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  if (hash.digest("hex") !== expected) {
    throw new Error(
      `Overture building store checksum mismatch for ${path.basename(filePath)}.`,
    );
  }
}

function stripStoredBounds(building: StoredBuilding): Building {
  return {
    id: building.id,
    footprint: building.footprint,
    heightMeters: building.heightMeters,
    minHeightMeters: building.minHeightMeters,
    floors: building.floors,
    source: building.source,
    confidence: building.confidence,
    heightSource: building.heightSource,
  };
}

export function tileKeysForBounds(bounds: BoundingBox, tileSizeDegrees: number) {
  const west = Math.floor(bounds.west / tileSizeDegrees);
  const east = Math.floor(bounds.east / tileSizeDegrees);
  const south = Math.floor(bounds.south / tileSizeDegrees);
  const north = Math.floor(bounds.north / tileSizeDegrees);
  const keys: string[] = [];

  for (let longitude = west; longitude <= east; longitude += 1) {
    for (let latitude = south; latitude <= north; latitude += 1) {
      keys.push(`${longitude}:${latitude}`);
    }
  }

  return keys;
}

export function boundsForFootprint(footprint: Polygon | MultiPolygon): BoundingBox {
  const coordinates =
    footprint.type === "Polygon"
      ? footprint.coordinates.flat()
      : footprint.coordinates.flat(2);
  const longitudes = coordinates.map((coordinate) => coordinate[0]);
  const latitudes = coordinates.map((coordinate) => coordinate[1]);

  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  };
}

function intersectsBounds(left: BoundingBox, right: BoundingBox) {
  return !(
    left.east < right.west ||
    left.west > right.east ||
    left.north < right.south ||
    left.south > right.north
  );
}
