import type { FeatureCollection, LineString, Polygon } from "geojson";
import type { BoundingBox } from "@/lib/environment/buildings/types";

export type CoveredFeatureKind =
  | "roofed-walkway"
  | "arcade"
  | "building-passage"
  | "tunnel"
  | "indoor-public-connector"
  | "transit-covered-walkway";

export type CoveredFeatureAccess = "public" | "permissive" | "customers" | "unknown" | "restricted";

export type CoverEvidence = {
  source: string;
  kind: CoveredFeatureKind;
  confidence: number;
  access: CoveredFeatureAccess;
  accessConfidence: number;
};

export type CoveredFeature = {
  id: string;
  geometry: LineString | Polygon;
  kind: CoveredFeatureKind;
  source: string;
  confidence: number;
  access: CoveredFeatureAccess;
  accessConfidence: number;
  evidence: CoverEvidence;
  tags?: Record<string, string>;
};

export type CoveredFeatureProviderMetadata = {
  provider: string;
  source: string;
  mode: string;
  region?: string;
  datasetVersion?: string;
  queryLatencyMs?: number;
};

export type CoveredFeatureProviderResult = {
  features: CoveredFeature[];
  metadata: CoveredFeatureProviderMetadata;
};

export type CoveredFeatureProvider = {
  getCoveredFeatures(
    bounds: BoundingBox,
    options?: { signal?: AbortSignal },
  ): Promise<CoveredFeatureProviderResult>;
};

export type CoveredFeatureDebug = {
  providerMode: string;
  provider?: string;
  source?: string;
  datasetVersion?: string;
  region?: string;
  loadedFeatures: number;
  eligibleFeatures?: number;
  restrictedFeatures?: number;
  querySucceeded: boolean;
};

export type CoveredFeatureDebugCollection = FeatureCollection<LineString | Polygon>;
