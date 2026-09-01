import assert from "node:assert/strict";
import test from "node:test";
import { decideRoutingContext } from "@/lib/comfort-routing/contextualMode";
import type { Coordinate } from "@/lib/geo/types";
import type { WeatherBundle, WeatherSnapshot } from "@/lib/weather/types";

const TEST_COORDINATE: Coordinate = { latitude: 39.5, longitude: -98.35 };

const CASES: Array<{
  name: string;
  weather: Partial<WeatherSnapshot>;
  capabilities: { rainCapable: boolean; heatCapable: boolean };
  expected: "balanced" | "cold" | "rain" | "heat";
}> = [
  {
    name: "calm cold",
    weather: { temperatureC: -8, apparentTemperatureC: -8, windSpeedMps: 1 },
    capabilities: { rainCapable: false, heatCapable: true },
    expected: "cold",
  },
  {
    name: "windy cold",
    weather: { temperatureC: 7, apparentTemperatureC: 1, windSpeedMps: 7 },
    capabilities: { rainCapable: false, heatCapable: true },
    expected: "cold",
  },
  {
    name: "sunny cold",
    weather: { temperatureC: -3, windSpeedMps: 2, shortCondition: "Sunny" },
    capabilities: { rainCapable: false, heatCapable: true },
    expected: "cold",
  },
  {
    name: "cold night",
    weather: { temperatureC: -10, windSpeedMps: 5, shortCondition: "Clear" },
    capabilities: { rainCapable: false, heatCapable: true },
    expected: "cold",
  },
  {
    name: "no rain",
    weather: { temperatureC: 14, precipitationMmPerHour: 0, windSpeedMps: 3 },
    capabilities: { rainCapable: true, heatCapable: true },
    expected: "balanced",
  },
  {
    name: "light rain",
    weather: { temperatureC: 12, precipitationMmPerHour: 0.8, windSpeedMps: 3 },
    capabilities: { rainCapable: true, heatCapable: true },
    expected: "rain",
  },
  {
    name: "heavy windy rain",
    weather: { temperatureC: 10, precipitationMmPerHour: 6, windSpeedMps: 9 },
    capabilities: { rainCapable: true, heatCapable: true },
    expected: "rain",
  },
  {
    name: "cover-rich rain",
    weather: { temperatureC: 11, precipitationMmPerHour: 2.2, windSpeedMps: 2 },
    capabilities: { rainCapable: true, heatCapable: true },
    expected: "rain",
  },
  {
    name: "mild heat",
    weather: { temperatureC: 28, apparentTemperatureC: 29, shortCondition: "Sunny" },
    capabilities: { rainCapable: true, heatCapable: true },
    expected: "balanced",
  },
  {
    name: "hot sunny",
    weather: { temperatureC: 39, apparentTemperatureC: 40, shortCondition: "Sunny" },
    capabilities: { rainCapable: true, heatCapable: true },
    expected: "heat",
  },
  {
    name: "extreme sunny",
    weather: { temperatureC: 44, apparentTemperatureC: 45, shortCondition: "Sunny" },
    capabilities: { rainCapable: true, heatCapable: true },
    expected: "heat",
  },
  {
    name: "late-day heat",
    weather: { temperatureC: 38, apparentTemperatureC: 38, shortCondition: "Clear" },
    capabilities: { rainCapable: true, heatCapable: true },
    expected: "heat",
  },
  {
    name: "hot night",
    weather: { temperatureC: 36, apparentTemperatureC: 37, shortCondition: "Mostly Cloudy" },
    capabilities: { rainCapable: true, heatCapable: true },
    expected: "heat",
  },
];

for (const scenario of CASES) {
  test(`Stage 10 climate matrix: ${scenario.name}`, () => {
    const decision = decideRoutingContext(
      weatherBundle(scenario.weather),
      scenario.capabilities,
    );
    assert.equal(decision.context, scenario.expected);
  });
}

test("context capabilities, not city names, gate rain and heat activation", () => {
  const rain = weatherBundle({ temperatureC: 15, precipitationMmPerHour: 5 });
  const heat = weatherBundle({
    temperatureC: 41,
    apparentTemperatureC: 42,
    shortCondition: "Sunny",
  });

  assert.equal(
    decideRoutingContext(rain, { rainCapable: false, heatCapable: true }).context,
    "balanced",
  );
  assert.equal(
    decideRoutingContext(heat, { rainCapable: true, heatCapable: false }).context,
    "balanced",
  );
});

function weatherBundle(values: Partial<WeatherSnapshot>): WeatherBundle {
  const timestamp = "2026-08-16T18:00:00.000Z";
  return {
    coordinate: TEST_COORDINATE,
    current: {
      timestamp,
      temperatureC: null,
      source: "stage-10-controlled-test",
      confidence: 1,
      ...values,
    },
    hourlyForecast: [],
    alerts: [],
    source: "stage-10-controlled-test",
    updatedAt: timestamp,
  };
}
