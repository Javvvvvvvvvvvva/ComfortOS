import fs from "node:fs/promises";
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
  checksums?: {
    buildingsSha256: string;
    tileIndexSha256: string;
  };
};

type TileIndex = Record<string, number[]>;

type StoredBuilding = Building & {
  bbox: BoundingBox;
};

type LocalOvertureBuildingProviderOptions = {
  storeDir: string;
};

const MANIFEST_FILE = "manifest.json";
const BUILDINGS_FILE = "buildings.jsonl";
const TILE_INDEX_FILE = "tile-index.json";

export class LocalOvertureBuildingProvider implements BuildingProvider {
  private readonly storeDir: string;
  private loaded:
    | {
        manifest: LocalOvertureStoreManifest;
        buildings: StoredBuilding[];
        tileIndex: TileIndex;
      }
    | null = null;

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

    return [...candidateIndexes].flatMap((index) => {
      const building = store.buildings[index];
      if (!building || !intersectsBounds(building.bbox, bounds)) return [];
      return [stripStoredBounds(building)];
    });
  }

  async getManifest() {
    return (await this.loadStore()).manifest;
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

  private async loadStore() {
    if (this.loaded) return this.loaded;

    const [manifestText, buildingsText, tileIndexText] = await Promise.all([
      fs.readFile(path.join(this.storeDir, MANIFEST_FILE), "utf8"),
      fs.readFile(path.join(this.storeDir, BUILDINGS_FILE), "utf8"),
      fs.readFile(path.join(this.storeDir, TILE_INDEX_FILE), "utf8"),
    ]);
    const manifest = JSON.parse(manifestText) as LocalOvertureStoreManifest;
    if (manifest.format !== "comfortos-local-building-store-v1") {
      throw new Error("Unsupported local Overture building store.");
    }
    verifyStoreChecksum(
      "buildings.jsonl",
      buildingsText,
      manifest.checksums?.buildingsSha256,
    );
    verifyStoreChecksum(
      "tile-index.json",
      tileIndexText,
      manifest.checksums?.tileIndexSha256,
    );

    this.loaded = {
      manifest,
      buildings: buildingsText
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as StoredBuilding),
      tileIndex: JSON.parse(tileIndexText) as TileIndex,
    };

    return this.loaded;
  }
}

function verifyStoreChecksum(name: string, content: string, expected?: string) {
  if (!expected) return;
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== expected) {
    throw new Error(`Overture building store checksum mismatch for ${name}.`);
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
