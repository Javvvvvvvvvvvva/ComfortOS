import type { FeatureCollection, LineString, MultiPolygon, Polygon } from "geojson";
import type { BuildingCoverage } from "@/lib/environment/buildings/types";
import type { Building } from "@/lib/environment/buildings/types";
import type { SolarPosition } from "@/lib/environment/solar/solarPositionEngine";
import type { Coordinate, LineStringGeometry } from "@/lib/geo/types";
import type { RouteResult } from "@/lib/routing/types";

export type RouteSegment = {
  id: string;
  geometry: LineString;
  distanceMeters: number;
  bearingDegrees: number;
  startDistanceMeters: number;
  endDistanceMeters: number;
};

export type TimedRouteSegment = RouteSegment & {
  estimatedEntryTime: string;
  estimatedExitTime: string;
  estimatedMidpointTime: string;
};

export type BuildingShadow = {
  buildingId: string;
  geometry: Polygon | MultiPolygon;
  sourceHeightMeters: number;
  confidence: number;
};

export type ShadowResult = {
  status: "daylight" | "night";
  solarPosition: SolarPosition;
  shadows: BuildingShadow[];
};

export type SegmentShade = {
  segmentId: string;
  shadeRatio: number;
  shadedMeters: number;
  exposedMeters: number;
  totalMeters: number;
  confidence: number;
  estimatedEntryTime?: string;
  estimatedExitTime?: string;
  estimatedMidpointTime?: string;
  solarAzimuthDeg?: number;
  solarElevationDeg?: number;
};

export type RouteShadeSummary = {
  shadeRatio: number;
  shadedMeters: number;
  exposedMeters: number;
  analyzedMeters: number;
  unknownMeters: number;
  confidence: number;
};

export type ShadeQuality = {
  geometryCoverage: number;
  heightCoverage: number;
  explicitHeightCoverage: number;
  derivedHeightCoverage: number;
  routeAnalysisCoverage: number;
  overallConfidence: number;
};

export type ShadeCoverage = BuildingCoverage & {
  routeMeters: number;
  analyzedMeters: number;
  unknownMeters: number;
};

export type ShadeAnalysisRequest = {
  route: RouteResult;
  departureTime: string;
  buildings?: Building[];
  projectionOrigin?: Coordinate;
  preparedBuildingContext?: unknown;
  includeDebug?: boolean;
};

export type ShadeAnalysisResult = {
  status: "available" | "unavailable" | "night";
  routeGeometry: LineStringGeometry;
  departureTime: string;
  solarPosition: SolarPosition;
  segments: TimedRouteSegment[];
  segmentShade: SegmentShade[];
  summary: RouteShadeSummary;
  coverage: ShadeCoverage;
  quality: ShadeQuality;
  debug?: {
    buildings: FeatureCollection<Polygon | MultiPolygon>;
    shadows: FeatureCollection<Polygon | MultiPolygon>;
    segments: FeatureCollection<LineString>;
    sourceComparison?: {
      defaultProvider: string;
      alternateProvider?: string;
      note: string;
    };
  };
};
