import assert from "node:assert/strict";
import test from "node:test";
import { ComfortAnalysisService } from "@/lib/comfort/service";
import { calculateNwsHeatIndexC } from "@/lib/environment/heat/heatIndex";
import { HeatAnalysisService } from "@/lib/environment/heat/heatExposureEngine";
import {
  assignSegmentTraversalTimes,
  segmentRouteGeometry,
} from "@/lib/environment/shade/routeSegmentation";
import type { HeatAnalysisResult } from "@/lib/environment/heat/types";
import type { ShadeAnalysisResult } from "@/lib/environment/shade/types";
import type { WindAnalysisResult } from "@/lib/environment/wind/types";
import type { RouteResult } from "@/lib/routing/types";
import type { WeatherBundle } from "@/lib/weather/types";

const departureTime = "2026-07-15T22:00:00.000Z";

test("NWS heat index is only used in its warm valid range", () => {
  assert.equal(calculateNwsHeatIndexC({ temperatureC: 24, relativeHumidity: 70 }), null);
  const hotHumid = calculateNwsHeatIndexC({ temperatureC: 35, relativeHumidity: 55 });
  assert.ok(hotHumid !== null && hotHumid > 35);
});

test("estimated building shade reduces direct-sun heat exposure", async () => {
  const route = makeRoute(600);
  const weather = makeWeather({ temperatureC: 40, apparentTemperatureC: 41, relativeHumidity: 25 });
  const exposed = await analyzeHeat({
    route,
    weather,
    shadeRatio: 0.05,
    solarElevationDeg: 68,
  });
  const shaded = await analyzeHeat({
    route,
    weather,
    shadeRatio: 0.75,
    solarElevationDeg: 68,
  });

  assert.ok(exposed.summary.directSunRatio > shaded.summary.directSunRatio);
  assert.ok(exposed.summary.averageHeatExposure > shaded.summary.averageHeatExposure);
});

test("night keeps ambient heat while direct solar exposure is zero", async () => {
  const result = await analyzeHeat({
    route: makeRoute(600),
    weather: makeWeather({ temperatureC: 36, apparentTemperatureC: 36, relativeHumidity: 20 }),
    shadeRatio: 0,
    solarElevationDeg: -8,
  });

  assert.equal(result.summary.directSunRatio, 0);
  assert.equal(result.summary.solarExposure, 0);
  assert.ok(result.summary.ambientHeatExposure > 0);
  assert.ok(result.summary.averageHeatExposure > 0);
});

test("bounded ventilation lowers hot-route cost but not below zero", async () => {
  const route = makeRoute(600);
  const weather = makeWeather({ temperatureC: 39, apparentTemperatureC: 39, relativeHumidity: 20 });
  const still = await analyzeHeat({
    route,
    weather,
    shadeRatio: 0.1,
    solarElevationDeg: 65,
    windExposureMps: 0,
  });
  const breezy = await analyzeHeat({
    route,
    weather,
    shadeRatio: 0.1,
    solarElevationDeg: 65,
    windExposureMps: 3,
  });

  assert.ok(breezy.summary.ventilationModifier < 0);
  assert.ok(breezy.summary.averageHeatExposure < still.summary.averageHeatExposure);
  assert.ok(breezy.summary.averageHeatExposure >= 0);
});

test("duration affects total heat exposure cost", async () => {
  const weather = makeWeather({ temperatureC: 40, apparentTemperatureC: 41, relativeHumidity: 25 });
  const short = await analyzeHeat({
    route: makeRoute(300),
    weather,
    shadeRatio: 0.1,
    solarElevationDeg: 68,
  });
  const long = await analyzeHeat({
    route: makeRoute(900),
    weather,
    shadeRatio: 0.1,
    solarElevationDeg: 68,
  });

  assert.ok(long.summary.totalHeatExposureCost > short.summary.totalHeatExposureCost);
});

test("heat comfort remains partial when shade analysis is missing", async () => {
  const route = makeRoute(600);
  const heatAnalysis = await new HeatAnalysisService().analyzeRouteHeat({
    route,
    departureTime,
    weatherBundle: makeWeather({ temperatureC: 39, apparentTemperatureC: 40, relativeHumidity: 25 }),
    shadeAnalysis: null,
    windAnalysis: null,
  });
  const comfort = await new ComfortAnalysisService().analyzeRouteComfort({
    route,
    departureTime,
    weatherBundle: makeWeather({ temperatureC: 39, apparentTemperatureC: 40, relativeHumidity: 25 }),
    heatAnalysis,
    profile: "heat",
  });

  assert.equal(comfort.routeComfortCost.comparable, false);
  assert.equal(comfort.summary.comfortScore, null);
  assert.equal(comfort.completeness.heatAvailable, false);
});

async function analyzeHeat({
  route,
  weather,
  shadeRatio,
  solarElevationDeg,
  windExposureMps = 1,
}: {
  route: RouteResult;
  weather: WeatherBundle;
  shadeRatio: number;
  solarElevationDeg: number;
  windExposureMps?: number;
}): Promise<HeatAnalysisResult> {
  return new HeatAnalysisService().analyzeRouteHeat({
    route,
    departureTime,
    weatherBundle: weather,
    shadeAnalysis: makeShadeAnalysis(route, shadeRatio, solarElevationDeg),
    windAnalysis: makeWindAnalysis(route, windExposureMps),
  });
}

function makeRoute(durationSeconds: number): RouteResult {
  return {
    durationSeconds,
    distanceMeters: 95,
    geometry: {
      type: "LineString",
      coordinates: [
        [-112.074, 33.451],
        [-112.073, 33.451],
      ],
    },
  };
}

function makeWeather({
  temperatureC,
  apparentTemperatureC,
  relativeHumidity,
}: {
  temperatureC: number;
  apparentTemperatureC: number;
  relativeHumidity: number;
}): WeatherBundle {
  return {
    coordinate: { latitude: 33.451, longitude: -112.074 },
    source: "test",
    updatedAt: departureTime,
    current: {
      timestamp: departureTime,
      temperatureC,
      apparentTemperatureC,
      relativeHumidity,
      windSpeedMps: 1,
      windDirectionDeg: 270,
      shortCondition: "Sunny",
      source: "test",
      confidence: 1,
    },
    hourlyForecast: [],
    alerts: [],
  };
}

function makeShadeAnalysis(
  route: RouteResult,
  shadeRatio: number,
  solarElevationDeg: number,
): ShadeAnalysisResult {
  const segments = timedSegments(route);
  return {
    status: solarElevationDeg > 0 ? "available" : "night",
    routeGeometry: route.geometry,
    departureTime,
    solarPosition: {
      azimuthDeg: 210,
      elevationDeg: solarElevationDeg,
      timestamp: departureTime,
      sunAboveHorizon: solarElevationDeg > 0,
    },
    segments,
    segmentShade: segments.map((segment) => ({
      segmentId: segment.id,
      estimatedMidpointTime: departureTime,
      totalMeters: segment.distanceMeters,
      shadedMeters: segment.distanceMeters * shadeRatio,
      exposedMeters: segment.distanceMeters * (1 - shadeRatio),
      unknownMeters: 0,
      shadeRatio,
      confidence: 1,
      solarAzimuthDeg: 210,
      solarElevationDeg,
    })),
    summary: {
      shadeRatio,
      shadedMeters: route.distanceMeters * shadeRatio,
      exposedMeters: route.distanceMeters * (1 - shadeRatio),
      analyzedMeters: route.distanceMeters,
      unknownMeters: 0,
      confidence: 1,
    },
    coverage: {
      routeMeters: route.distanceMeters,
      analyzedMeters: route.distanceMeters,
      unknownMeters: 0,
      buildingCount: 0,
      usableBuildingCount: 0,
      explicitHeightBuildingCount: 0,
      floorDerivedHeightBuildingCount: 0,
      unknownHeightBuildingCount: 0,
    },
    quality: {
      geometryCoverage: 1,
      heightCoverage: 1,
      explicitHeightCoverage: 1,
      derivedHeightCoverage: 0,
      routeAnalysisCoverage: 1,
      overallConfidence: 1,
    },
  };
}

function makeWindAnalysis(route: RouteResult, estimatedExposureMps: number): WindAnalysisResult {
  const segments = timedSegments(route);
  return {
    status: "available",
    routeGeometry: route.geometry,
    departureTime,
    segments,
    segmentWind: segments.map((segment) => ({
      segmentId: segment.id,
      segmentBearingDeg: 90,
      regionalWindSpeedMps: estimatedExposureMps,
      regionalWindDirectionDeg: 270,
      windDataConfidence: 1,
      relativeWindAngleDeg: 180,
      estimatedWindExposureMps: estimatedExposureMps,
      estimatedExposureMps,
      headwindComponentMps: 0,
      crosswindComponentMps: estimatedExposureMps,
      tailwindComponentMps: 0,
      shelterFactor: 0,
      opennessFactor: 1,
      channelingFactor: 0,
      unknownMeters: 0,
      classification: "neutral",
      confidence: 1,
      estimatedEntryTime: segment.estimatedEntryTime,
      estimatedMidpointTime: segment.estimatedMidpointTime,
      estimatedExitTime: segment.estimatedExitTime,
    })),
    summary: {
      averageEstimatedExposureMps: estimatedExposureMps,
      averageHeadwindMps: 0,
      averageCrosswindMps: estimatedExposureMps,
      shelteredMeters: 0,
      neutralMeters: route.distanceMeters,
      exposedMeters: 0,
      analyzedMeters: route.distanceMeters,
      unknownMeters: 0,
      confidence: 1,
    },
    coverage: {
      routeMeters: route.distanceMeters,
      analyzedMeters: route.distanceMeters,
      unknownMeters: 0,
      shelteredMeters: 0,
      neutralMeters: route.distanceMeters,
      exposedMeters: 0,
      buildingCount: 0,
      usableBuildingCount: 0,
      explicitHeightBuildingCount: 0,
      floorDerivedHeightBuildingCount: 0,
      unknownHeightBuildingCount: 0,
    },
    quality: {
      weatherConfidence: 1,
      geometryCoverage: 1,
      heightCoverage: 1,
      shelterModelConfidence: 1,
      routeAnalysisCoverage: 1,
      overallConfidence: 1,
    },
  };
}

function timedSegments(route: RouteResult) {
  return assignSegmentTraversalTimes({
    segments: segmentRouteGeometry(route.geometry),
    departureTime,
    routeDurationSeconds: route.durationSeconds,
  });
}
