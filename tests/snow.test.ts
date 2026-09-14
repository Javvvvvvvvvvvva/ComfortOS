import assert from "node:assert/strict";
import test from "node:test";
import type { LineString } from "geojson";
import { ComfortAnalysisService } from "@/lib/comfort/service";
import type { CoveredFeature } from "@/lib/environment/coveredFeatures/types";
import { SnowAnalysisService } from "@/lib/environment/snow/snowExposureEngine";
import type { WindAnalysisResult } from "@/lib/environment/wind/types";
import type { RouteResult } from "@/lib/routing/types";
import type { WeatherBundle } from "@/lib/weather/types";

const DEPARTURE_TIME = "2026-01-15T18:00:00.000Z";

test("known zero snow and ice produce zero winter exposure", async () => {
  const result = await analyze({ snowfall: 0, ice: 0, wind: 3, coveredFeatures: [] });

  assert.equal(result.summary.averageSnowfallExposure, 0);
  assert.equal(result.summary.averageIceExposure, 0);
  assert.equal(result.summary.totalSnowExposureCost, 0);
});

test("overhead cover materially lowers active snowfall exposure", async () => {
  const uncovered = await analyze({ snowfall: 8, ice: 0, wind: 4, coveredFeatures: [] });
  const covered = await analyze({
    snowfall: 8,
    ice: 0,
    wind: 4,
    coveredFeatures: [coverLine(0, 100)],
  });

  assert.ok(covered.summary.averageSnowfallExposure < uncovered.summary.averageSnowfallExposure * 0.35);
  assert.ok(covered.summary.coveredMeters > 70);
});

test("stronger pedestrian wind increases active snowfall exposure", async () => {
  const sheltered = await analyze({ snowfall: 8, ice: 0, wind: 1, coveredFeatures: [] });
  const exposed = await analyze({ snowfall: 8, ice: 0, wind: 9, coveredFeatures: [] });

  assert.ok(exposed.summary.averageSnowfallExposure > sheltered.summary.averageSnowfallExposure);
});

test("overhead cover does not erase estimated ice accumulation exposure", async () => {
  const uncovered = await analyze({ snowfall: 0, ice: 0.12, wind: 3, coveredFeatures: [] });
  const covered = await analyze({
    snowfall: 0,
    ice: 0.12,
    wind: 3,
    coveredFeatures: [coverLine(0, 100)],
  });

  assert.equal(covered.summary.averageIceExposure, uncovered.summary.averageIceExposure);
  assert.ok(covered.summary.averageIceExposure > 0);
});

test("missing snowfall and ice rates stay partial and non-comparable", async () => {
  const snow = await analyze({ snowfall: null, ice: null, wind: 4, coveredFeatures: [] });
  const comfort = await new ComfortAnalysisService().analyzeRouteComfort({
    route: route(),
    departureTime: DEPARTURE_TIME,
    weatherBundle: weather({ snowfall: null, ice: null, wind: 4 }),
    windAnalysis: windAnalysis(4),
    snowAnalysis: snow,
    profile: "snow",
  });

  assert.equal(snow.quality.snowfallRateAvailable, false);
  assert.equal(comfort.completeness.snowAvailable, false);
  assert.equal(comfort.routeComfortCost.comparable, false);
  assert.equal(comfort.summary.comfortScore, null);
});

test("Snow Comfort raw cost rewards covered lower-wind walking", async () => {
  const exposedSnow = await analyze({ snowfall: 8, ice: 0.03, wind: 8, coveredFeatures: [] });
  const coveredSnow = await analyze({
    snowfall: 8,
    ice: 0.03,
    wind: 2,
    coveredFeatures: [coverLine(0, 100)],
  });
  const service = new ComfortAnalysisService();
  const exposed = await service.analyzeRouteComfort({
    route: route(),
    departureTime: DEPARTURE_TIME,
    weatherBundle: weather({ snowfall: 8, ice: 0.03, wind: 8 }),
    windAnalysis: windAnalysis(8),
    snowAnalysis: exposedSnow,
    profile: "snow",
  });
  const covered = await service.analyzeRouteComfort({
    route: route(),
    departureTime: DEPARTURE_TIME,
    weatherBundle: weather({ snowfall: 8, ice: 0.03, wind: 2 }),
    windAnalysis: windAnalysis(2),
    snowAnalysis: coveredSnow,
    profile: "snow",
  });

  assert.equal(exposed.routeComfortCost.comparable, true);
  assert.equal(covered.routeComfortCost.comparable, true);
  assert.ok(covered.routeComfortCost.averageEnvironmentalCost < exposed.routeComfortCost.averageEnvironmentalCost);
});

function analyze({
  snowfall,
  ice,
  wind,
  coveredFeatures,
}: {
  snowfall: number | null;
  ice: number | null;
  wind: number;
  coveredFeatures: CoveredFeature[];
}) {
  return new SnowAnalysisService().analyzeRouteSnow({
    route: route(),
    departureTime: DEPARTURE_TIME,
    weatherBundle: weather({ snowfall, ice, wind }),
    windAnalysis: windAnalysis(wind),
    coveredFeatures,
  });
}

function route(): RouteResult {
  return {
    geometry: {
      type: "LineString",
      coordinates: [
        [-93.265, 44.9778],
        [-93.265, 44.9787],
      ],
    },
    distanceMeters: 100,
    durationSeconds: 80,
    provider: { id: "test" },
  };
}

function weather({
  snowfall,
  ice,
  wind,
}: {
  snowfall: number | null;
  ice: number | null;
  wind: number;
}): WeatherBundle {
  return {
    coordinate: { latitude: 44.9778, longitude: -93.265 },
    current: null,
    hourlyForecast: [
      {
        timestamp: DEPARTURE_TIME,
        temperatureC: -6,
        windSpeedMps: wind,
        windDirectionDeg: 270,
        precipitationMmPerHour: snowfall === null ? null : snowfall / 10,
        snowfallMmPerHour: snowfall,
        iceAccumulationMmPerHour: ice,
        precipitationType:
          snowfall === null && ice === null
            ? "snow"
            : (ice ?? 0) > 0 && (snowfall ?? 0) > 0
              ? "mixed"
              : (ice ?? 0) > 0
                ? "freezing-rain"
                : (snowfall ?? 0) > 0
                  ? "snow"
                  : "none",
        shortCondition: (snowfall ?? 0) > 0 ? "Snow" : "Cloudy",
      },
    ],
    alerts: [],
    source: "controlled-snow-fixture",
    updatedAt: DEPARTURE_TIME,
  };
}

function windAnalysis(exposureMps: number): WindAnalysisResult {
  const routeValue = route();
  return {
    status: "available",
    routeGeometry: routeValue.geometry,
    departureTime: DEPARTURE_TIME,
    segments: [],
    segmentWind: [
      {
        segmentId: "segment-1",
        regionalWindSpeedMps: exposureMps,
        regionalWindDirectionDeg: 270,
        windDataConfidence: 1,
        segmentBearingDeg: 0,
        relativeWindAngleDeg: 90,
        headwindComponentMps: 0,
        crosswindComponentMps: exposureMps,
        tailwindComponentMps: 0,
        shelterFactor: 0,
        opennessFactor: 1,
        channelingFactor: 1,
        estimatedExposureMps: exposureMps,
        estimatedWindExposureMps: exposureMps,
        unknownMeters: 0,
        classification: "exposed",
        confidence: 1,
        estimatedEntryTime: DEPARTURE_TIME,
        estimatedMidpointTime: "2026-01-15T18:00:40.000Z",
        estimatedExitTime: "2026-01-15T18:01:20.000Z",
      },
    ],
    summary: {
      averageEstimatedExposureMps: exposureMps,
      averageHeadwindMps: 0,
      averageCrosswindMps: exposureMps,
      shelteredMeters: 0,
      neutralMeters: 0,
      exposedMeters: 100,
      analyzedMeters: 100,
      unknownMeters: 0,
      confidence: 1,
    },
    coverage: {
      routeMeters: 100,
      analyzedMeters: 100,
      unknownMeters: 0,
      shelteredMeters: 0,
      neutralMeters: 0,
      exposedMeters: 100,
      buildingCount: 0,
      usableBuildingCount: 0,
      explicitHeightBuildingCount: 0,
      floorDerivedHeightBuildingCount: 0,
      unknownHeightBuildingCount: 0,
    },
    quality: {
      weatherConfidence: 1,
      geometryCoverage: 1,
      heightCoverage: 0,
      shelterModelConfidence: 0.68,
      routeAnalysisCoverage: 1,
      overallConfidence: 1,
    },
  };
}

function coverLine(startMeters: number, endMeters: number): CoveredFeature {
  const metersToLat = 1 / 111_320;
  const geometry: LineString = {
    type: "LineString",
    coordinates: [
      [-93.265, 44.9778 + startMeters * metersToLat],
      [-93.265, 44.9778 + endMeters * metersToLat],
    ],
  };
  return {
    id: `cover-${startMeters}-${endMeters}`,
    geometry,
    kind: "roofed-walkway",
    source: "controlled-snow-fixture",
    confidence: 1,
    access: "public",
    accessConfidence: 1,
    evidence: {
      source: "controlled-snow-fixture",
      kind: "roofed-walkway",
      confidence: 1,
      access: "public",
      accessConfidence: 1,
    },
  };
}
