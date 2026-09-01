import assert from "node:assert/strict";
import test from "node:test";
import type { LineString, Polygon } from "geojson";
import { RainAnalysisService, calculateWindDrivenRainModifier } from "@/lib/environment/rain/rainExposureEngine";
import type { CoveredFeature } from "@/lib/environment/coveredFeatures/types";
import type { RouteResult } from "@/lib/routing/types";
import type { WeatherBundle } from "@/lib/weather/types";
import { ComfortAnalysisService } from "@/lib/comfort/service";

const DEPARTURE_TIME = "2026-08-12T18:00:00.000Z";

test("rain plus no cover produces high exposure", async () => {
  const result = await analyze({ intensity: 4, coveredFeatures: [] });

  assert.ok(result.summary.averageRainExposure > 0.45);
  assert.equal(Math.round(result.summary.exposedMeters), 100);
  assert.equal(Math.round(result.summary.coveredMeters), 0);
});

test("same rain with full overhead cover materially lowers exposure", async () => {
  const uncovered = await analyze({ intensity: 4, coveredFeatures: [] });
  const covered = await analyze({ intensity: 4, coveredFeatures: [coverLine(0, 100)] });

  assert.ok(covered.summary.averageRainExposure < uncovered.summary.averageRainExposure * 0.35);
  assert.ok(covered.summary.coveredMeters > 70);
});

test("no rain produces zero exposure", async () => {
  const result = await analyze({ intensity: 0, coveredFeatures: [] });

  assert.equal(result.summary.averageRainExposure, 0);
  assert.equal(result.summary.totalRainExposureCost, 0);
});

test("heavy rain is costlier than light rain", async () => {
  const light = await analyze({ intensity: 0.8, coveredFeatures: [] });
  const heavy = await analyze({ intensity: 6, coveredFeatures: [] });

  assert.ok(heavy.summary.averageRainExposure > light.summary.averageRainExposure);
});

test("missing rain intensity is partial rather than dry", async () => {
  const result = await analyze({ intensity: null, probability: 85, coveredFeatures: [] });

  assert.equal(result.summary.averageRainExposure, 0);
  assert.ok(result.summary.confidence < 0.5);
  assert.equal(result.quality.precipitationIntensityAvailable, false);
});

test("wind-driven rain increases exposure for crosswind orientation", () => {
  const crosswind = calculateWindDrivenRainModifier({
    windSpeedMps: 8,
    windDirectionDeg: 270,
    segmentBearingDeg: 0,
    coveredRatio: 0,
  });
  const aligned = calculateWindDrivenRainModifier({
    windSpeedMps: 8,
    windDirectionDeg: 0,
    segmentBearingDeg: 0,
    coveredRatio: 0,
  });

  assert.ok(crosswind > aligned);
});

test("short covered section only protects that portion", async () => {
  const result = await analyze({ intensity: 4, coveredFeatures: [coverLine(0, 25)] });

  assert.ok(result.summary.coveredMeters > 10);
  assert.ok(result.summary.coveredMeters < 45);
  assert.ok(result.summary.exposedMeters > result.summary.coveredMeters);
});

test("long covered section decreases route exposure proportionally", async () => {
  const short = await analyze({ intensity: 4, coveredFeatures: [coverLine(0, 25)] });
  const long = await analyze({ intensity: 4, coveredFeatures: [coverLine(0, 90)] });

  assert.ok(long.summary.averageRainExposure < short.summary.averageRainExposure);
  assert.ok(long.summary.coveredMeters > short.summary.coveredMeters);
});

test("rain comfort profile uses rain analysis and remains comparable with rain data", async () => {
  const rain = await analyze({ intensity: 4, coveredFeatures: [] });
  const comfort = await new ComfortAnalysisService().analyzeRouteComfort({
    route: route(),
    departureTime: DEPARTURE_TIME,
    weatherBundle: weather({ intensity: 4 }),
    rainAnalysis: rain,
    profile: "rain",
  });

  assert.equal(comfort.profile, "rain");
  assert.equal(comfort.routeComfortCost.comparable, true);
  assert.ok(comfort.summary.rainExposure > 0);
  assert.equal(comfort.completeness.rainAvailable, true);
});

function analyze({
  intensity,
  probability = 100,
  coveredFeatures,
}: {
  intensity: number | null;
  probability?: number;
  coveredFeatures: CoveredFeature[];
}) {
  return new RainAnalysisService().analyzeRouteRain({
    route: route(),
    departureTime: DEPARTURE_TIME,
    weatherBundle: weather({ intensity, probability }),
    coveredFeatures,
  });
}

function route(): RouteResult {
  return {
    geometry: {
      type: "LineString",
      coordinates: [
        [-122.34, 47.61],
        [-122.34, 47.6109],
      ],
    },
    distanceMeters: 100,
    durationSeconds: 80,
    provider: { id: "test" },
  };
}

function weather({
  intensity,
  probability = 100,
}: {
  intensity: number | null;
  probability?: number;
}): WeatherBundle {
  return {
    coordinate: { latitude: 47.61, longitude: -122.34 },
    current: null,
    hourlyForecast: [
      {
        timestamp: DEPARTURE_TIME,
        precipitationMmPerHour: intensity,
        precipitationProbability: probability,
        windSpeedMps: 5,
        windDirectionDeg: 270,
        shortCondition: intensity === 0 ? "Cloudy" : "Rain",
      },
    ],
    alerts: [],
    source: "test",
    updatedAt: DEPARTURE_TIME,
  };
}

function coverLine(startMeters: number, endMeters: number): CoveredFeature {
  const metersToLat = 1 / 111_320;
  const geometry: LineString = {
    type: "LineString",
    coordinates: [
      [-122.34, 47.61 + startMeters * metersToLat],
      [-122.34, 47.61 + endMeters * metersToLat],
    ],
  };
  return {
    id: `cover-${startMeters}-${endMeters}`,
    geometry,
    kind: "roofed-walkway",
    source: "test",
    confidence: 1,
    access: "public",
    accessConfidence: 1,
    evidence: {
      source: "test",
      kind: "roofed-walkway",
      confidence: 1,
      access: "public",
      accessConfidence: 1,
    },
  };
}

export function coverPolygon(): CoveredFeature {
  const geometry: Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [-122.34005, 47.61],
        [-122.33995, 47.61],
        [-122.33995, 47.6109],
        [-122.34005, 47.6109],
        [-122.34005, 47.61],
      ],
    ],
  };
  return {
    id: "cover-polygon",
    geometry,
    kind: "arcade",
    source: "test",
    confidence: 1,
    access: "public",
    accessConfidence: 1,
    evidence: {
      source: "test",
      kind: "arcade",
      confidence: 1,
      access: "public",
      accessConfidence: 1,
    },
  };
}
