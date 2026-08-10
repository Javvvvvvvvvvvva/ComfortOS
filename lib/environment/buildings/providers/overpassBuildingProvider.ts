import type { Polygon } from "geojson";
import { normalizeBuildingHeight } from "@/lib/environment/buildings/height";
import type {
  BoundingBox,
  Building,
  BuildingProvider,
} from "@/lib/environment/buildings/types";

const DEFAULT_OVERPASS_BASE_URL = "https://overpass-api.de/api/interpreter";
const DEFAULT_FALLBACK_OVERPASS_BASE_URLS = [
  "https://overpass.kumi.systems/api/interpreter",
];
const REQUEST_TIMEOUT_MS = 15000;
const OSM_SOURCE = "OpenStreetMap via Overpass API";

type JsonRecord = Record<string, unknown>;

type OverpassProviderOptions = {
  baseUrl?: string;
  fallbackBaseUrls?: string[];
  fetcher?: typeof fetch;
};

export class OverpassBuildingProvider implements BuildingProvider {
  private readonly baseUrl: string;
  private readonly fallbackBaseUrls: string[];
  private readonly fetcher: typeof fetch;

  constructor(options: OverpassProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_OVERPASS_BASE_URL;
    this.fallbackBaseUrls =
      options.fallbackBaseUrls ?? DEFAULT_FALLBACK_OVERPASS_BASE_URLS;
    this.fetcher = options.fetcher ?? fetch;
  }

  async getBuildings(bounds: BoundingBox): Promise<Building[]> {
    const response = await this.fetchOverpass(bounds);
    return normalizeOverpassBuildingResponse(response);
  }

  private async fetchOverpass(bounds: BoundingBox) {
    const endpoints = [this.baseUrl, ...this.fallbackBaseUrls];

    for (const endpoint of endpoints) {
      try {
        return await this.fetchEndpoint(endpoint, bounds);
      } catch {
        // Try the next public Overpass instance; direct Overpass is development-only.
      }
    }

    throw new Error("Building data unavailable.");
  }

  private async fetchEndpoint(endpoint: string, bounds: BoundingBox) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const url = new URL(endpoint);
    url.searchParams.set("data", buildOverpassQuery(bounds));

    try {
      const response = await this.fetcher(url, {
        headers: {
          "user-agent": "ComfortOS Stage 2 building validation",
        },
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Building data unavailable.");
      return JSON.parse(await response.text()) as unknown;
    } catch {
      throw new Error("Building data unavailable.");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function buildOverpassQuery(bounds: BoundingBox) {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  return `
[out:json][timeout:25];
(
  way["building"](${bbox});
  way["building:part"](${bbox});
  relation["building"](${bbox});
  relation["building:part"](${bbox});
);
out tags geom;
`.trim();
}

export function normalizeOverpassBuildingResponse(response: unknown): Building[] {
  const root = getRecord(response);
  const elements = Array.isArray(root.elements) ? root.elements : [];

  return elements.flatMap((element) => {
    const item = getRecordOrNull(element);
    if (!item) return [];

    const geometry = normalizeOverpassGeometry(item.geometry);
    if (!geometry) return [];

    const tags = getRecordOrNull(item.tags) ?? {};
    const height = normalizeBuildingHeight({
      height: tags.height ?? tags["building:height"],
      minHeight: tags.min_height ?? tags["building:min_height"],
      floors: tags["building:levels"] ?? tags.levels,
      sourceConfidence: 0.78,
    });

    return [
      {
        id: `${asString(item.type) ?? "osm"}:${String(item.id)}`,
        footprint: geometry,
        heightMeters: height.heightMeters,
        minHeightMeters: height.minHeightMeters,
        floors: height.floors,
        source: OSM_SOURCE,
        confidence: height.confidence,
        heightSource: height.heightSource,
      },
    ];
  });
}

function normalizeOverpassGeometry(value: unknown): Polygon | null {
  if (!Array.isArray(value) || value.length < 4) return null;

  const ring = value.flatMap((point) => {
    const record = getRecordOrNull(point);
    const latitude = asNumber(record?.lat);
    const longitude = asNumber(record?.lon);
    return latitude === null || longitude === null ? [] : [[longitude, latitude] as [number, number]];
  });

  if (ring.length < 4) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closedRing =
    first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];

  if (closedRing.length < 4) return null;
  return { type: "Polygon", coordinates: [closedRing] };
}

function getRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed building provider response.");
  }

  return value as JsonRecord;
}

function getRecordOrNull(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
