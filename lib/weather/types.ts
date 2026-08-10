import type { Coordinate } from "@/lib/geo/types";

export type WeatherSnapshot = {
  timestamp: string;
  temperatureC: number | null;
  apparentTemperatureC?: number | null;
  relativeHumidity?: number | null;
  windSpeedMps?: number | null;
  windDirectionDeg?: number | null;
  windGustMps?: number | null;
  precipitationProbability?: number | null;
  precipitationMmPerHour?: number | null;
  cloudCover?: number | null;
  visibilityMeters?: number | null;
  shortCondition?: string;
  source: string;
  confidence?: number;
};

export type WeatherForecastPoint = {
  timestamp: string;
  temperatureC?: number | null;
  apparentTemperatureC?: number | null;
  relativeHumidity?: number | null;
  windSpeedMps?: number | null;
  windDirectionDeg?: number | null;
  precipitationProbability?: number | null;
  shortCondition?: string;
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
  coordinate: Coordinate;
  current: WeatherSnapshot | null;
  hourlyForecast: WeatherForecastPoint[];
  alerts: WeatherAlert[];
  source: string;
  updatedAt: string;
};

export interface WeatherProvider {
  getCurrentWeather(coordinate: Coordinate): Promise<WeatherSnapshot>;
  getHourlyForecast(coordinate: Coordinate): Promise<WeatherForecastPoint[]>;
  getActiveAlerts(coordinate: Coordinate): Promise<WeatherAlert[]>;
}
