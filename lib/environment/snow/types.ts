import type { FeatureCollection, LineString } from "geojson";
import type { RouteCoverRun } from "@/lib/environment/coveredFeatures/routeCoverMetrics";
import type { CoveredFeature } from "@/lib/environment/coveredFeatures/types";
import type { WindAnalysisResult } from "@/lib/environment/wind/types";
import type { Coordinate, LineStringGeometry } from "@/lib/geo/types";
import type { RouteResult } from "@/lib/routing/types";
import type { PrecipitationType } from "@/lib/weather/precipitation";
import type { WeatherBundle } from "@/lib/weather/types";

export type SegmentSnowExposure = {
  segmentId: string;
  timestamp: string;
  distanceMeters: number;
  durationSeconds: number;
  precipitationType: PrecipitationType | null;
  temperatureC: number | null;
  snowfallMmPerHour: number | null;
  iceAccumulationMmPerHour: number | null;
  coveredRatio: number;
  exposedRatio: number;
  unknownCoverRatio: number;
  conservativeExposureRatio: number;
  estimatedWindExposureMps: number | null;
  windDrivenSnowFactor: number;
  estimatedSnowfallExposure: number;
  estimatedIceExposure: number;
  confidence: number;
  completeness: number;
};

export type RouteSnowSummary = {
  analyzedMeters: number;
  unknownMeters: number;
  coveredMeters: number;
  exposedMeters: number;
  unknownCoverMeters: number;
  longestContinuousCoveredMeters: number;
  averageSnowfallExposure: number;
  averageIceExposure: number;
  maximumSnowfallMmPerHour: number | null;
  maximumIceAccumulationMmPerHour: number | null;
  totalSnowExposureCost: number;
  confidence: number;
  completeness: number;
};

export type SnowQuality = {
  snowfallRateAvailable: boolean;
  iceAccumulationRateAvailable: boolean;
  precipitationTypeAvailable: boolean;
  windAnalysisAvailable: boolean;
  coverDataAvailable: boolean;
  terrainGradeAvailable: false;
  overallConfidence: number;
};

export type SnowAnalysisRequest = {
  route: RouteResult;
  departureTime: string;
  weatherBundle?: WeatherBundle | null;
  weatherCoordinate?: Coordinate;
  windAnalysis?: WindAnalysisResult | null;
  coveredFeatures?: CoveredFeature[] | null;
};

export type SnowAnalysisResult = {
  status: "available";
  modelVersion: string;
  routeGeometry: LineStringGeometry;
  departureTime: string;
  segmentSnow: SegmentSnowExposure[];
  summary: RouteSnowSummary;
  quality: SnowQuality;
  debug?: {
    segments: FeatureCollection<LineString>;
    coveredRuns: FeatureCollection<LineString>;
    runs: RouteCoverRun[];
    note: string;
  };
};
