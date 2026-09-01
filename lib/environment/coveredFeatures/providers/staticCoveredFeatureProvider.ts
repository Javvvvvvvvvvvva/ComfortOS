import fs from "node:fs/promises";
import type { FeatureCollection, LineString, Polygon } from "geojson";
import type { BoundingBox } from "@/lib/environment/buildings/types";
import type {
  CoveredFeature,
  CoveredFeatureProvider,
  CoveredFeatureProviderResult,
} from "@/lib/environment/coveredFeatures/types";
import {
  inferAccess,
  inferCoveredFeatureSemantics,
  normalizeCoveredFeatureKind,
} from "@/lib/environment/coveredFeatures/semantics";

type StaticCoveredFeatureProviderOptions = {
  filePath: string;
  region?: string;
};

export class StaticCoveredFeatureProvider implements CoveredFeatureProvider {
  private loaded: CoveredFeature[] | null = null;

  constructor(private readonly options: StaticCoveredFeatureProviderOptions) {}

  async getCoveredFeatures(bounds: BoundingBox): Promise<CoveredFeatureProviderResult> {
    const startedAt = performance.now();
    const features = (await this.loadFeatures()).filter((feature) =>
      intersectsBounds(boundsForGeometry(feature.geometry), bounds),
    );

    return {
      features,
      metadata: {
      provider: "Static OSM covered-feature extract",
      source: this.options.filePath,
      mode: "static-osm",
        region: this.options.region,
        queryLatencyMs: Math.round(performance.now() - startedAt),
      },
    };
  }

  private async loadFeatures() {
    if (this.loaded) return this.loaded;
    const parsed = JSON.parse(await fs.readFile(this.options.filePath, "utf8")) as
      | FeatureCollection
      | { features?: unknown };
    const features = Array.isArray(parsed.features) ? parsed.features : [];
    this.loaded = features.flatMap((feature, index) =>
      normalizeStaticFeature(feature, index),
    );
    return this.loaded;
  }
}

function normalizeStaticFeature(feature: unknown, index: number): CoveredFeature[] {
  if (!feature || typeof feature !== "object" || Array.isArray(feature)) return [];
  const record = feature as {
    id?: unknown;
    geometry?: unknown;
    properties?: Record<string, unknown> | null;
  };
  const geometry = normalizeGeometry(record.geometry);
  if (!geometry) return [];
  const properties = record.properties ?? {};
  const tags = normalizeTags(properties.tags);
  const tagSemantics = Object.keys(tags).length > 0 ? inferCoveredFeatureSemantics(tags) : null;
  if (tagSemantics && !tagSemantics.eligible) return [];
  const kind =
    tagSemantics?.kind ??
    (typeof properties.kind === "string"
      ? normalizeCoveredFeatureKind(properties.kind)
      : "roofed-walkway");
  const access =
    tagSemantics ??
    (typeof properties.access === "string"
      ? inferStaticAccess(properties.access)
      : inferAccess(tags));
  const source =
    typeof properties.source === "string"
      ? properties.source
      : "static-covered-feature";
  const confidence =
    typeof properties.confidence === "number" && !tagSemantics
      ? clamp01(properties.confidence)
      : tagSemantics?.confidence ?? 0.78;
  return [
    {
      id: typeof record.id === "string" ? record.id : `static-covered-${index}`,
      geometry,
      kind,
      source,
      confidence,
      access: access.access,
      accessConfidence:
        typeof properties.accessConfidence === "number"
          ? clamp01(properties.accessConfidence)
          : access.accessConfidence,
      evidence: {
        source,
        kind,
        confidence,
        access: access.access,
        accessConfidence:
          typeof properties.accessConfidence === "number"
            ? clamp01(properties.accessConfidence)
            : access.accessConfidence,
      },
      tags,
    },
  ];
}

function normalizeGeometry(value: unknown): LineString | Polygon | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const geometry = value as Partial<LineString | Polygon>;
  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    return geometry as LineString;
  }
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return geometry as Polygon;
  }
  return null;
}

function boundsForGeometry(geometry: LineString | Polygon): BoundingBox {
  const coordinates =
    geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates.flat();
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

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function normalizeTags(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, raw]) =>
      typeof raw === "string" ? [[key, raw]] : [],
    ),
  );
}

function inferStaticAccess(value: string) {
  if (
    value === "public" ||
    value === "permissive" ||
    value === "customers" ||
    value === "unknown" ||
    value === "restricted"
  ) {
    return {
      access: value,
      accessConfidence:
        value === "public" ? 0.9 : value === "permissive" ? 0.78 : value === "customers" ? 0.45 : value === "unknown" ? 0.58 : 0,
    } as const;
  }
  return { access: "unknown", accessConfidence: 0.58 } as const;
}
