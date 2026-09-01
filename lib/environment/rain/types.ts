import type { FeatureCollection, LineString } from "geojson";
import type { RouteCoverRun } from "@/lib/environment/coveredFeatures/routeCoverMetrics";
import type { CoveredFeature } from "@/lib/environment/coveredFeatures/types";
import type { Coordinate, LineStringGeometry } from "@/lib/geo/types";
import type { RouteResult } from "@/lib/routing/types";
import type { WeatherBundle } from "@/lib/weather/types";

export type SegmentRainExposure = {
  segmentId: string;
  timestamp: string;
  distanceMeters: number;
  durationSeconds: number;
  precipitationIntensityMmPerHour?: number | null;
  precipitationProbability?: number | null;
  regionalWindSpeedMps?: number | null;
  regionalWindDirectionDeg?: number | null;
  coveredRatio: number;
  exposedRatio: number;
  unknownRatio: number;
  coveredMeters: number;
  exposedMeters: number;
  unknownMeters: number;
  windDrivenExposureFactor: number;
  estimatedRainExposure: number;
  confidence: number;
};

export type RouteRainSummary = {
  analyzedMeters: number;
  coveredMeters: number;
  exposedMeters: number;
  unknownMeters: number;
  longestContinuousCoveredMeters: number;
  coveredSegmentCount: number;
  averageCoveredRunLength: number;
  averageRainExposure: number;
  totalRainExposureCost: number;
  confidence: number;
  completeness: number;
};

export type RainQuality = {
  precipitationIntensityAvailable: boolean;
  precipitationProbabilityAvailable: boolean;
  coverDataAvailable: boolean;
  routeAnalysisCoverage: number;
  overallConfidence: number;
};

export type RainAnalysisRequest = {
  route: RouteResult;
  departureTime: string;
  weatherBundle?: WeatherBundle | null;
  weatherCoordinate?: Coordinate;
  coveredFeatures?: CoveredFeature[] | null;
};

export type RainAnalysisResult = {
  status: "available";
  routeGeometry: LineStringGeometry;
  departureTime: string;
  segmentRain: SegmentRainExposure[];
  summary: RouteRainSummary;
  quality: RainQuality;
  debug?: {
    segments: FeatureCollection<LineString>;
    coveredRuns: FeatureCollection<LineString>;
    runs: RouteCoverRun[];
    note: string;
  };
};
