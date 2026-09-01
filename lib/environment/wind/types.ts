import type { FeatureCollection, LineString, MultiPolygon, Polygon } from "geojson";
import type { BuildingCoverage } from "@/lib/environment/buildings/types";
import type { Building } from "@/lib/environment/buildings/types";
import type { TimedRouteSegment } from "@/lib/environment/shade/types";
import type { Coordinate, LineStringGeometry } from "@/lib/geo/types";
import type { RouteResult } from "@/lib/routing/types";
import type { WeatherBundle } from "@/lib/weather/types";

export type WindState = {
  timestamp: string;
  speedMps: number;
  directionFromDeg: number;
  source: string;
  confidence: number;
  selectionMethod: "current" | "nearest-hour" | "interpolated-hourly";
};

export type SegmentWind = {
  segmentId: string;
  regionalWindSpeedMps: number;
  regionalWindDirectionDeg: number;
  windDataConfidence: number;
  segmentBearingDeg: number;
  relativeWindAngleDeg: number;
  headwindComponentMps: number;
  crosswindComponentMps: number;
  tailwindComponentMps: number;
  shelterFactor: number;
  opennessFactor: number;
  channelingFactor: number;
  estimatedExposureMps: number;
  estimatedWindExposureMps: number;
  unknownMeters: number;
  classification: "sheltered" | "neutral" | "exposed" | "unknown";
  confidence: number;
  estimatedEntryTime: string;
  estimatedMidpointTime: string;
  estimatedExitTime: string;
};

export type RouteWindSummary = {
  averageEstimatedExposureMps: number;
  averageHeadwindMps: number;
  averageCrosswindMps: number;
  shelteredMeters: number;
  neutralMeters: number;
  exposedMeters: number;
  analyzedMeters: number;
  unknownMeters: number;
  confidence: number;
};

export type WindQuality = {
  weatherConfidence: number;
  geometryCoverage: number;
  heightCoverage: number;
  shelterModelConfidence: number;
  routeAnalysisCoverage: number;
  overallConfidence: number;
};

export type WindCoverage = BuildingCoverage & {
  routeMeters: number;
  analyzedMeters: number;
  unknownMeters: number;
  shelteredMeters: number;
  neutralMeters: number;
  exposedMeters: number;
};

export type WindAnalysisRequest = {
  route: RouteResult;
  departureTime: string;
  weatherCoordinate?: Coordinate;
  weatherBundle?: WeatherBundle;
  buildings?: Building[];
  includeDebug?: boolean;
};

export type WindAnalysisResult = {
  status: "available" | "unavailable";
  routeGeometry: LineStringGeometry;
  departureTime: string;
  segments: TimedRouteSegment[];
  segmentWind: SegmentWind[];
  summary: RouteWindSummary;
  coverage: WindCoverage;
  quality: WindQuality;
  debug?: {
    buildings: FeatureCollection<Polygon | MultiPolygon>;
    segments: FeatureCollection<LineString>;
    windVectors: FeatureCollection<LineString>;
    note: string;
  };
};

export type UrbanWindModel = {
  estimateSegmentWind(
    segment: TimedRouteSegment,
    regionalWind: WindState,
    context: UrbanWindContext,
  ): SegmentWind;
};

export type UrbanWindContext = {
  buildings: import("@/lib/environment/buildings/types").Building[];
  projectionOrigin: Coordinate;
  preparedBuildingContext?: unknown;
};
