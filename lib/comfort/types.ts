import type { FeatureCollection, LineString } from "geojson";
import type { ShadeAnalysisResult } from "@/lib/environment/shade/types";
import type { WindAnalysisResult } from "@/lib/environment/wind/types";
import type { RainAnalysisResult } from "@/lib/environment/rain/types";
import type { HeatAnalysisResult } from "@/lib/environment/heat/types";
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
  | "sun"
  | "heat"
  | "rain";

export type SegmentComfortWeather = {
  temperatureC?: number | null;
  apparentTemperatureC?: number | null;
  relativeHumidity?: number | null;
  regionalWindSpeedMps?: number | null;
  regionalWindDirectionDeg?: number | null;
  precipitationProbability?: number | null;
  precipitationMmPerHour?: number | null;
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
  rain?: {
    estimatedRainExposure: number;
    precipitationIntensityMmPerHour?: number | null;
    precipitationProbability?: number | null;
    coveredRatio: number;
    windDrivenExposureFactor: number;
    confidence: number;
  };
  heat?: {
    totalHeatExposureCost: number;
    totalHeatExposureMinutesCost: number;
    ambientHeatCost: number;
    humidityCost: number;
    solarExposureCost: number;
    ventilationModifier: number;
    shadeRatio: number | null;
    directSunRatio: number | null;
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
  estimatedRainExposure: number | null;
  estimatedHeatExposure: number | null;
  thermalCost: number;
  windCost: number;
  solarCost: number;
  rainCost: number;
  heatCost: number;
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
    rainExposure?: number;
    uncoveredRainExposure?: number;
    windDrivenRain?: number;
    heatAmbient?: number;
    humidity?: number;
    sunExposure?: number;
    ventilationBenefit?: number;
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
  rainExposure: number;
  heatExposure: number;
  analyzedMeters: number;
  unknownMeters: number;
  confidence: number;
  dominantFactors: ComfortDominantFactor[];
};

export type ComfortAnalysisCompleteness = {
  weatherAvailable: boolean;
  windAvailable: boolean;
  shadeAvailable: boolean;
  rainAvailable: boolean;
  heatAvailable: boolean;
  weatherWeight: number;
  windWeight: number;
  shadeWeight: number;
  rainWeight: number;
  heatWeight: number;
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
  rainAnalysis?: RainAnalysisResult | null;
  heatAnalysis?: HeatAnalysisResult | null;
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
