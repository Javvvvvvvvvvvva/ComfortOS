import assert from "node:assert/strict";
import test from "node:test";
import { decideRoutingContext } from "@/lib/comfort-routing/contextualMode";
import { explainComfortRoute } from "@/lib/comfort-routing/explanations";
import type { AnalyzedRouteCandidate } from "@/lib/comfort-routing/types";
import type { WeatherBundle } from "@/lib/weather/types";

test("cold contextual mode uses weather thresholds rather than city names", () => {
  const decision = decideRoutingContext(weather({ temperatureC: -2, windSpeedMps: 2 }));

  assert.equal(decision.context, "cold");
  assert.equal(decision.routeLabel, "Stay Warm");
});

test("mild weather remains balanced and does not show Stay Warm", () => {
  const decision = decideRoutingContext(weather({ temperatureC: 24, windSpeedMps: 2 }));

  assert.equal(decision.context, "balanced");
  assert.equal(decision.routeLabel, "Comfort");
});

test("windy cool weather activates cold context", () => {
  const decision = decideRoutingContext(weather({ temperatureC: 8, windSpeedMps: 6 }));

  assert.equal(decision.context, "cold");
});

test("rain context activates from rain conditions rather than city names", () => {
  const decision = decideRoutingContext(
    weather({
      temperatureC: 12,
      windSpeedMps: 3,
      precipitationMmPerHour: 1.5,
      shortCondition: "Rain",
    }),
    { rainCapable: true },
  );

  assert.equal(decision.context, "rain");
  assert.equal(decision.routeLabel, "Stay Dry");
});

test("rainy weather remains balanced when rain capability is unavailable", () => {
  const decision = decideRoutingContext(
    weather({
      temperatureC: 12,
      windSpeedMps: 3,
      precipitationMmPerHour: 1.5,
      shortCondition: "Rain",
    }),
    { rainCapable: false },
  );

  assert.equal(decision.context, "balanced");
  assert.equal(decision.routeLabel, "Comfort");
});

test("no-rain Seattle-like weather remains balanced", () => {
  const decision = decideRoutingContext(
    weather({
      temperatureC: 9,
      windSpeedMps: 2,
      precipitationMmPerHour: 0,
      shortCondition: "Cloudy",
    }),
    { rainCapable: true },
  );

  assert.equal(decision.context, "balanced");
});

test("severe cold outranks light rain", () => {
  const decision = decideRoutingContext(
    weather({
      temperatureC: -8,
      windSpeedMps: 5,
      precipitationMmPerHour: 0.4,
      shortCondition: "Light Rain",
    }),
    { rainCapable: true },
  );

  assert.equal(decision.context, "cold");
});

test("heat context activates from hot sunny conditions rather than city names", () => {
  const decision = decideRoutingContext(
    weather({
      temperatureC: 41,
      apparentTemperatureC: 42,
      windSpeedMps: 2,
      shortCondition: "Sunny",
    }),
    { heatCapable: true },
  );

  assert.equal(decision.context, "heat");
  assert.equal(decision.routeLabel, "Stay Cool");
});

test("hot weather remains balanced when heat capability is unavailable", () => {
  const decision = decideRoutingContext(
    weather({
      temperatureC: 41,
      apparentTemperatureC: 42,
      windSpeedMps: 2,
      shortCondition: "Sunny",
    }),
    { heatCapable: false },
  );

  assert.equal(decision.context, "balanced");
});

test("extreme heat outranks light rain when heat data is capable", () => {
  const decision = decideRoutingContext(
    weather({
      temperatureC: 44,
      apparentTemperatureC: 45,
      windSpeedMps: 2,
      precipitationMmPerHour: 0.3,
      shortCondition: "Light Rain",
    }),
    { rainCapable: true, heatCapable: true },
  );

  assert.equal(decision.context, "heat");
});

test("heavy rain outranks moderate heat when rain data is capable", () => {
  const decision = decideRoutingContext(
    weather({
      temperatureC: 36,
      apparentTemperatureC: 37,
      windSpeedMps: 2,
      precipitationMmPerHour: 3.6,
      shortCondition: "Rain",
    }),
    { rainCapable: true, heatCapable: true },
  );

  assert.equal(decision.context, "rain");
});

test("route explanations suppress trivial differences and rank meaningful facts", () => {
  const explanations = explainComfortRoute({
    fastest: candidate({ wind: 5, headwind: 1.2, shade: 0.6, reduction: 0 }),
    comfort: candidate({ wind: 3.9, headwind: 0.7, shade: 0.35, reduction: 0.12 }),
  });

  assert.deepEqual(
    explanations.map((item) => item.label),
    [
      "12% lower environmental exposure",
      "22% lower estimated wind exposure",
      "Less headwind",
    ],
  );
});

test("route explanations omit noise-level changes", () => {
  const explanations = explainComfortRoute({
    fastest: candidate({ wind: 2, headwind: 0.2, shade: 0.5, reduction: 0 }),
    comfort: candidate({ wind: 1.9, headwind: 0.1, shade: 0.45, reduction: 0.01 }),
  });

  assert.deepEqual(explanations, []);
});

function weather({
  temperatureC,
  apparentTemperatureC,
  windSpeedMps,
  precipitationMmPerHour,
  shortCondition,
}: {
  temperatureC: number;
  apparentTemperatureC?: number;
  windSpeedMps: number;
  precipitationMmPerHour?: number;
  shortCondition?: string;
}): WeatherBundle {
  return {
    coordinate: { latitude: 44.98, longitude: -93.26 },
    source: "test",
    updatedAt: "2026-08-10T12:00:00.000Z",
    current: {
      timestamp: "2026-08-10T12:00:00.000Z",
      temperatureC,
      apparentTemperatureC: apparentTemperatureC ?? temperatureC,
      windSpeedMps,
      windDirectionDeg: 315,
      precipitationMmPerHour: precipitationMmPerHour ?? null,
      shortCondition,
      source: "test",
      confidence: 1,
    },
    hourlyForecast: [],
    alerts: [],
  };
}

function candidate({
  wind,
  headwind,
  shade,
  reduction,
}: {
  wind: number;
  headwind: number;
  shade: number;
  reduction: number;
}): AnalyzedRouteCandidate {
  return {
    id: String(wind),
    role: "alternative",
    status: "complete",
    routeOverlapRatio: 0,
    route: {
      id: String(wind),
      sourceRouteIndex: 0,
      durationSeconds: 600,
      distanceMeters: 800,
      geometry: {
        type: "LineString",
        coordinates: [
          [-93.27, 44.98],
          [-93.26, 44.99],
        ],
      },
    },
    metrics: {
      routeOverlapRatio: 0,
      overlapWithFastest: 0,
      uniqueMeters: 0,
      maxLateralSeparationMeters: 0,
      extraDurationSeconds: 0,
      extraDistanceMeters: 0,
      environmentalCostReductionRatio: reduction,
      detourEligible: true,
      meaningfulImprovement: true,
    },
    shadeAnalysis: {
      summary: { shadeRatio: shade },
    } as AnalyzedRouteCandidate["shadeAnalysis"],
    windAnalysis: {
      summary: {
        averageEstimatedExposureMps: wind,
        averageHeadwindMps: headwind,
      },
    } as AnalyzedRouteCandidate["windAnalysis"],
  };
}
