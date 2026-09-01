import type { Coordinate } from "@/lib/geo/types";
import type { WeatherBundle } from "@/lib/weather/types";

export type EnvironmentalScenario = {
  id: string;
  label: string;
  timestamp: string;
  temperatureC: number;
  windSpeedMps: number;
  windDirectionDeg: number;
  relativeHumidity?: number;
  source: "research-scenario";
};

export const MINNEAPOLIS_WINTER_SCENARIOS: EnvironmentalScenario[] = [
  {
    id: "WINTER_NW_STRONG",
    label: "Controlled Winter Scenario: strong northwest wind",
    timestamp: "2026-01-15T18:00:00.000Z",
    temperatureC: -12,
    windSpeedMps: 8,
    windDirectionDeg: 315,
    relativeHumidity: 62,
    source: "research-scenario",
  },
  {
    id: "WINTER_WEST_MODERATE",
    label: "Controlled Winter Scenario: moderate west wind",
    timestamp: "2026-01-15T18:00:00.000Z",
    temperatureC: -8,
    windSpeedMps: 5,
    windDirectionDeg: 270,
    relativeHumidity: 60,
    source: "research-scenario",
  },
  {
    id: "WINTER_CALM",
    label: "Controlled Winter Scenario: calm cold daylight",
    timestamp: "2026-01-15T18:00:00.000Z",
    temperatureC: -10,
    windSpeedMps: 1,
    windDirectionDeg: 315,
    relativeHumidity: 64,
    source: "research-scenario",
  },
  {
    id: "WINTER_NIGHT",
    label: "Controlled Winter Scenario: winter night wind",
    timestamp: "2026-01-15T06:00:00.000Z",
    temperatureC: -12,
    windSpeedMps: 6,
    windDirectionDeg: 315,
    relativeHumidity: 65,
    source: "research-scenario",
  },
];

export function scenarioToWeatherBundle(
  scenario: EnvironmentalScenario,
  coordinate: Coordinate,
): WeatherBundle {
  return {
    coordinate,
    source: "research-scenario",
    updatedAt: scenario.timestamp,
    current: {
      timestamp: scenario.timestamp,
      temperatureC: scenario.temperatureC,
      apparentTemperatureC: scenario.temperatureC,
      relativeHumidity: scenario.relativeHumidity ?? null,
      windSpeedMps: scenario.windSpeedMps,
      windDirectionDeg: scenario.windDirectionDeg,
      shortCondition: scenario.label,
      source: "research-scenario",
      confidence: 1,
    },
    hourlyForecast: Array.from({ length: 8 }, (_, index) => ({
      timestamp: new Date(Date.parse(scenario.timestamp) + index * 60 * 60 * 1000).toISOString(),
      temperatureC: scenario.temperatureC,
      apparentTemperatureC: scenario.temperatureC,
      relativeHumidity: scenario.relativeHumidity ?? null,
      windSpeedMps: scenario.windSpeedMps,
      windDirectionDeg: scenario.windDirectionDeg,
      shortCondition: scenario.label,
    })),
    alerts: [],
  };
}

export function assertResearchScenarioAllowed() {
  if (process.env.NODE_ENV === "production" && process.env.COMFORTOS_ENABLE_RESEARCH_ROUTING !== "true") {
    throw new Error("Research environmental scenarios are disabled in production runtime.");
  }
}
