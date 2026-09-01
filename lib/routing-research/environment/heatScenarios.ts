import type { Coordinate } from "@/lib/geo/types";
import type { WeatherBundle } from "@/lib/weather/types";

export type ControlledHeatScenario = {
  id:
    | "HEAT_EXTREME_SUN"
    | "HEAT_HOT_SUN"
    | "HEAT_HOT_LATE_DAY"
    | "HEAT_HOT_NIGHT";
  label: string;
  timestamp: string;
  temperatureC: number;
  apparentTemperatureC: number;
  relativeHumidity: number;
  windSpeedMps: number;
  windDirectionDeg: number;
  shortCondition: string;
  source: "research-scenario";
};

export const CONTROLLED_HEAT_SCENARIOS: ControlledHeatScenario[] = [
  {
    id: "HEAT_EXTREME_SUN",
    label: "Controlled Heat Scenario: extreme sunny afternoon",
    timestamp: "2026-07-15T22:00:00.000Z",
    temperatureC: 44,
    apparentTemperatureC: 45,
    relativeHumidity: 18,
    windSpeedMps: 1.5,
    windDirectionDeg: 250,
    shortCondition: "Sunny",
    source: "research-scenario",
  },
  {
    id: "HEAT_HOT_SUN",
    label: "Controlled Heat Scenario: hot sunny afternoon",
    timestamp: "2026-07-15T21:00:00.000Z",
    temperatureC: 39,
    apparentTemperatureC: 40,
    relativeHumidity: 24,
    windSpeedMps: 2.5,
    windDirectionDeg: 260,
    shortCondition: "Sunny",
    source: "research-scenario",
  },
  {
    id: "HEAT_HOT_LATE_DAY",
    label: "Controlled Heat Scenario: hot late day lower sun",
    timestamp: "2026-07-16T00:00:00.000Z",
    temperatureC: 38,
    apparentTemperatureC: 38,
    relativeHumidity: 22,
    windSpeedMps: 3,
    windDirectionDeg: 270,
    shortCondition: "Clear",
    source: "research-scenario",
  },
  {
    id: "HEAT_HOT_NIGHT",
    label: "Controlled Heat Scenario: hot night no direct sun",
    timestamp: "2026-07-16T05:00:00.000Z",
    temperatureC: 34,
    apparentTemperatureC: 34,
    relativeHumidity: 28,
    windSpeedMps: 2,
    windDirectionDeg: 280,
    shortCondition: "Clear",
    source: "research-scenario",
  },
];

export function heatScenarioToWeatherBundle(
  scenario: ControlledHeatScenario,
  coordinate: Coordinate,
): WeatherBundle {
  const hourlyForecast = Array.from({ length: 6 }, (_, index) => ({
    timestamp: new Date(Date.parse(scenario.timestamp) + index * 60 * 60 * 1000).toISOString(),
    temperatureC: scenario.temperatureC,
    apparentTemperatureC: scenario.apparentTemperatureC,
    relativeHumidity: scenario.relativeHumidity,
    windSpeedMps: scenario.windSpeedMps,
    windDirectionDeg: scenario.windDirectionDeg,
    precipitationProbability: 0,
    precipitationMmPerHour: 0,
    shortCondition: scenario.shortCondition,
  }));

  return {
    coordinate,
    current: {
      timestamp: scenario.timestamp,
      temperatureC: scenario.temperatureC,
      apparentTemperatureC: scenario.apparentTemperatureC,
      relativeHumidity: scenario.relativeHumidity,
      windSpeedMps: scenario.windSpeedMps,
      windDirectionDeg: scenario.windDirectionDeg,
      precipitationProbability: 0,
      precipitationMmPerHour: 0,
      shortCondition: scenario.shortCondition,
      source: scenario.source,
      confidence: 1,
    },
    hourlyForecast,
    alerts: [],
    source: scenario.source,
    updatedAt: scenario.timestamp,
  };
}
