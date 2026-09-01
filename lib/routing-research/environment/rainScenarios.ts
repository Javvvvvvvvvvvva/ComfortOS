import type { WeatherBundle } from "@/lib/weather/types";
import type { Coordinate } from "@/lib/geo/types";

export type ControlledRainScenario = {
  id: "RAIN_LIGHT" | "RAIN_HEAVY_WINDY" | "RAIN_CALM";
  label: string;
  timestamp: string;
  precipitationMmPerHour: number;
  precipitationProbability: number;
  windSpeedMps: number;
  windDirectionDeg: number;
  source: "research-scenario";
};

export const CONTROLLED_RAIN_SCENARIOS: ControlledRainScenario[] = [
  {
    id: "RAIN_LIGHT",
    label: "Controlled Rain Scenario: light rain, modest wind",
    timestamp: "2026-11-12T17:00:00.000Z",
    precipitationMmPerHour: 0.8,
    precipitationProbability: 65,
    windSpeedMps: 4,
    windDirectionDeg: 220,
    source: "research-scenario",
  },
  {
    id: "RAIN_HEAVY_WINDY",
    label: "Controlled Rain Scenario: heavy wind-driven rain",
    timestamp: "2026-11-12T17:00:00.000Z",
    precipitationMmPerHour: 6,
    precipitationProbability: 95,
    windSpeedMps: 9,
    windDirectionDeg: 225,
    source: "research-scenario",
  },
  {
    id: "RAIN_CALM",
    label: "Controlled Rain Scenario: steady calm rain",
    timestamp: "2026-11-12T17:00:00.000Z",
    precipitationMmPerHour: 2.2,
    precipitationProbability: 85,
    windSpeedMps: 1.2,
    windDirectionDeg: 180,
    source: "research-scenario",
  },
];

export function rainScenarioToWeatherBundle(
  scenario: ControlledRainScenario,
  coordinate: Coordinate,
): WeatherBundle {
  const hourlyForecast = Array.from({ length: 4 }, (_, index) => ({
    timestamp: new Date(Date.parse(scenario.timestamp) + index * 60 * 60 * 1000).toISOString(),
    temperatureC: 8,
    apparentTemperatureC: 8,
    relativeHumidity: 92,
    windSpeedMps: scenario.windSpeedMps,
    windDirectionDeg: scenario.windDirectionDeg,
    precipitationProbability: scenario.precipitationProbability,
    precipitationMmPerHour: scenario.precipitationMmPerHour,
    shortCondition: "Rain",
  }));
  return {
    coordinate,
    current: {
      timestamp: scenario.timestamp,
      temperatureC: 8,
      apparentTemperatureC: 8,
      relativeHumidity: 92,
      windSpeedMps: scenario.windSpeedMps,
      windDirectionDeg: scenario.windDirectionDeg,
      precipitationProbability: scenario.precipitationProbability,
      precipitationMmPerHour: scenario.precipitationMmPerHour,
      shortCondition: "Rain",
      source: scenario.source,
      confidence: 1,
    },
    hourlyForecast,
    alerts: [],
    source: scenario.source,
    updatedAt: scenario.timestamp,
  };
}
