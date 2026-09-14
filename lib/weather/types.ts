import type { Coordinate } from "@/lib/geo/types";
import type { PrecipitationType } from "@/lib/weather/precipitation";

export type WeatherSnapshot = {
  timestamp: string;
  temperatureC: number | null;
  apparentTemperatureC?: number | null;
  apparentTemperatureSource?: "heat-index" | "wind-chill" | "provider" | "none";
  heatIndexC?: number | null;
  windChillC?: number | null;
  dewPointC?: number | null;
  relativeHumidity?: number | null;
  windSpeedMps?: number | null;
  windDirectionDeg?: number | null;
  windGustMps?: number | null;
  precipitationProbability?: number | null;
  precipitationMmPerHour?: number | null;
  snowfallMmPerHour?: number | null;
  iceAccumulationMmPerHour?: number | null;
  precipitationType?: PrecipitationType | null;
  cloudCover?: number | null;
  visibilityMeters?: number | null;
  shortCondition?: string;
  source: string;
  confidence?: number;
  observationStationId?: string;
  observationStationDistanceMeters?: number | null;
  observationAgeMinutes?: number | null;
};

export type WeatherForecastPoint = {
  timestamp: string;
  temperatureC?: number | null;
  apparentTemperatureC?: number | null;
  heatIndexC?: number | null;
  windChillC?: number | null;
  dewPointC?: number | null;
  relativeHumidity?: number | null;
  windSpeedMps?: number | null;
  windDirectionDeg?: number | null;
  precipitationProbability?: number | null;
  precipitationMmPerHour?: number | null;
  snowfallMmPerHour?: number | null;
  iceAccumulationMmPerHour?: number | null;
  precipitationType?: PrecipitationType | null;
  cloudCover?: number | null;
  shortCondition?: string;
};

export type WeatherDataQuality = {
  currentObservationAgeMinutes: number | null;
  currentObservationFresh: boolean;
  currentObservationStationDistanceMeters: number | null;
  forecastPointCount: number;
  humidityCoverage: number;
  cloudCoverCoverage: number;
  windCoverage: number;
  snowfallCoverage: number;
  iceAccumulationCoverage: number;
};

export type WeatherAlert = {
  id: string;
  event: string;
  severity?: string;
  urgency?: string;
  certainty?: string;
  headline?: string;
  description?: string;
  instruction?: string;
  effective?: string;
  expires?: string;
  source: string;
};

export type WeatherBundle = {
  normalizationVersion?: string;
  coordinate: Coordinate;
  current: WeatherSnapshot | null;
  hourlyForecast: WeatherForecastPoint[];
  alerts: WeatherAlert[];
  source: string;
  updatedAt: string;
  quality?: WeatherDataQuality;
};

export interface WeatherProvider {
  getCurrentWeather(coordinate: Coordinate): Promise<WeatherSnapshot>;
  getHourlyForecast(coordinate: Coordinate): Promise<WeatherForecastPoint[]>;
  getActiveAlerts(coordinate: Coordinate): Promise<WeatherAlert[]>;
}
