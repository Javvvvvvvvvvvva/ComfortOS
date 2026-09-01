import type { FeatureCollection, LineString } from "geojson";
import type { ShadeAnalysisResult } from "@/lib/environment/shade/types";
import type { WindAnalysisResult } from "@/lib/environment/wind/types";
import type { Coordinate, LineStringGeometry } from "@/lib/geo/types";
import type { RouteResult } from "@/lib/routing/types";
import type { WeatherBundle } from "@/lib/weather/types";

export type SegmentHeatExposure = {
  segmentId: string;
  timestamp: string;
  distanceMeters: number;
  durationSeconds: number;
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  heatIndexC: number | null;
  effectiveHeatTemperatureC: number | null;
  relativeHumidity: number | null;
  shadeRatio: number | null;
  directSunRatio: number | null;
  solarElevationDeg: number | null;
  solarElevationModifier: number;
  windExposureMps: number | null;
  ventilationModifier: number;
  ambientHeatCost: number;
  humidityCost: number;
  solarExposureCost: number;
  totalHeatExposureCost: number;
  totalHeatExposureMinutesCost: number;
  confidence: number;
};

export type RouteHeatSummary = {
  analyzedMeters: number;
  unknownMeters: number;
  averageHeatExposure: number;
  totalHeatExposureCost: number;
  ambientHeatExposure: number;
  solarExposure: number;
  ventilationModifier: number;
  shadeRatio: number;
  directSunRatio: number;
  longestContinuousSunMeters: number;
  longestContinuousSunSeconds: number;
  sunnyRunCount: number;
  confidence: number;
  completeness: number;
};

export type HeatQuality = {
  temperatureAvailable: boolean;
  apparentTemperatureAvailable: boolean;
  humidityAvailable: boolean;
  shadeAvailable: boolean;
  windAvailable: boolean;
  routeAnalysisCoverage: number;
  overallConfidence: number;
};

export type HeatAnalysisRequest = {
  route: RouteResult;
  departureTime: string;
  weatherBundle?: WeatherBundle | null;
  weatherCoordinate?: Coordinate;
  shadeAnalysis?: ShadeAnalysisResult | null;
  windAnalysis?: WindAnalysisResult | null;
};

export type HeatAnalysisResult = {
  status: "available";
  routeGeometry: LineStringGeometry;
  departureTime: string;
  segmentHeat: SegmentHeatExposure[];
  summary: RouteHeatSummary;
  quality: HeatQuality;
  debug?: {
    segments: FeatureCollection<LineString>;
    note: string;
  };
};
