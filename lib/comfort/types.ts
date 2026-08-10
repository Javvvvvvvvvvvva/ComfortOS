import type { FeatureCollection, LineString } from "geojson";
import type { ShadeAnalysisResult } from "@/lib/environment/shade/types";
import type { WindAnalysisResult } from "@/lib/environment/wind/types";
import type { LineStringGeometry } from "@/lib/geo/types";
import type { RouteResult } from "@/lib/routing/types";
import type { WeatherBundle } from "@/lib/weather/types";

export type ComfortProfileId = "cold" | "balanced" | "heat" | "rain";

export type ComfortFactorType =
  | "cold"
  | "wind"
  | "headwind"
  | "crosswind"
  | "shade"
  | "sun";

export type SegmentComfortWeather = {
  temperatureC?: number | null;
  apparentTemperatureC?: number | null;
  relativeHumidity?: number | null;
  regionalWindSpeedMps?: number | null;
  precipitationProbability?: number | null;
  condition?: string | null;
  confidence: number;
  selectionMethod: "interpolated-hourly" | "nearest-hour" | "current" | "missing";
};

export type SegmentComfortInput = {
  segmentId: string;
  distanceMeters: number;
  durationSeconds: number;
  estimatedMidpointTime: string;
  weather: SegmentComfortWeather;
  shade?: {
    shadeRatio: number;
    confidence: number;
    solarElevationDeg?: number;
  };
  wind?: {
    estimatedExposureMps: number;
    headwindComponentMps: number;
    crosswindComponentMps: number;
    shelterFactor: number;
    confidence: number;
  };
};

export type SegmentComfortResult = {
  segmentId: string;
  estimatedMidpointTime: string;
  distanceMeters: number;
  durationSeconds: number;
  temperatureC: number | null;
  estimatedPedestrianWindChillC: number | null;
  shadeRatio: number | null;
  estimatedWindExposureMps: number | null;
  thermalCost: number;
  windCost: number;
  solarCost: number;
  comfortCostRate: number;
  totalComfortCost: number;
  contributions: {
    cold?: number;
    estimatedWindChill?: number;
    windExposure?: number;
    headwind?: number;
    crosswind?: number;
    solarExposure?: number;
    winterSunBenefit?: number;
  };
  confidence: number;
};

export type ComfortDominantFactor = {
  type: ComfortFactorType;
  contribution: number;
};

export type RouteComfortSummary = {
  totalComfortCost: number;
  averageComfortCost: number;
  comfortScore: number | null;
  scoreStatus: "complete" | "partial";
  thermalExposure: number;
  windExposure: number;
  solarExposure: number;
  analyzedMeters: number;
  unknownMeters: number;
  confidence: number;
  dominantFactors: ComfortDominantFactor[];
};

export type ComfortAnalysisCompleteness = {
  weatherAvailable: boolean;
  windAvailable: boolean;
  shadeAvailable: boolean;
  weatherWeight: number;
  windWeight: number;
  shadeWeight: number;
  analyzedWeight: number;
  comparable: boolean;
};

export type ComfortQuality = {
  weatherConfidence: number;
  shadeConfidence: number;
  windConfidence: number;
  routeAnalysisCoverage: number;
  overallConfidence: number;
};

export type RouteComfortCost = {
  environmentalExposureCost: number;
  averageEnvironmentalCost: number;
  analyzedDurationMinutes: number;
  confidence: number;
  completeness: number;
  comparable: boolean;
};

export type ComfortAnalysisRequest = {
  route: RouteResult;
  departureTime: string;
  weatherBundle?: WeatherBundle | null;
  shadeAnalysis?: ShadeAnalysisResult | null;
  windAnalysis?: WindAnalysisResult | null;
  profile?: ComfortProfileId;
};

export type ComfortAnalysisResult = {
  status: "available";
  profile: ComfortProfileId;
  routeGeometry: LineStringGeometry;
  departureTime: string;
  segmentComfort: SegmentComfortResult[];
  summary: RouteComfortSummary;
  completeness: ComfortAnalysisCompleteness;
  routeComfortCost: RouteComfortCost;
  quality: ComfortQuality;
  debug?: {
    segments: FeatureCollection<LineString>;
    note: string;
  };
};
