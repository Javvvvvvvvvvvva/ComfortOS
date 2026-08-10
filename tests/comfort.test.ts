import assert from "node:assert/strict";
import test from "node:test";
import { ComfortEngine } from "@/lib/comfort/comfortEngine";
import { ComfortAnalysisService } from "@/lib/comfort/service";
import { calculateEstimatedPedestrianWindChill } from "@/lib/comfort/thermal";
import type {
  ComfortAnalysisRequest,
  SegmentComfortInput,
} from "@/lib/comfort/types";
import { COLD_COMFORT_WEIGHTS } from "@/lib/comfort/weights";
import { createLocalProjection } from "@/lib/environment/shade/projection";
import type { ShadeAnalysisResult } from "@/lib/environment/shade/types";
import type { WindAnalysisResult } from "@/lib/environment/wind/types";
import type { Coordinate, LineStringGeometry } from "@/lib/geo/types";
import type { RouteResult } from "@/lib/routing/types";
import type { WeatherBundle } from "@/lib/weather/types";

const ORIGIN: Coordinate = { latitude: 44.9778, longitude: -93.265 };
const engine = new ComfortEngine(COLD_COMFORT_WEIGHTS);

test("same temperature with more wind worsens cold comfort", () => {
  const calm = engine.evaluateSegment(makeInput({ windExposure: 1 }));
  const windy = engine.evaluateSegment(makeInput({ windExposure: 8 }));

  assert.ok(windy.totalComfortCost > calm.totalComfortCost);
  assert.ok(windy.windCost > calm.windCost);
});

test("same cold weather with lower pedestrian wind improves comfort", () => {
  const exposed = engine.evaluateSegment(makeInput({ windExposure: 7 }));
  const sheltered = engine.evaluateSegment(makeInput({ windExposure: 2, shelterFactor: 0.6 }));

  assert.ok(sheltered.totalComfortCost < exposed.totalComfortCost);
});

test("winter daytime direct sun improves comfort modestly", () => {
  const sunny = engine.evaluateSegment(makeInput({ shadeRatio: 0, solarElevationDeg: 24 }));
  const shaded = engine.evaluateSegment(makeInput({ shadeRatio: 1, solarElevationDeg: 24 }));

  assert.ok(sunny.totalComfortCost < shaded.totalComfortCost);
  assert.ok(shaded.totalComfortCost - sunny.totalComfortCost < 1);
});

test("cold headwind segment is worse than cold tailwind segment", () => {
  const headwind = engine.evaluateSegment(makeInput({ headwind: 5, windExposure: 5 }));
  const tailwind = engine.evaluateSegment(makeInput({ headwind: 0, windExposure: 5 }));

  assert.ok(headwind.totalComfortCost > tailwind.totalComfortCost);
});

test("zero wind has zero wind contribution", () => {
  const result = engine.evaluateSegment(makeInput({ windExposure: 0, headwind: 0, crosswind: 0 }));

  assert.equal(result.windCost, 0);
  assert.equal(result.estimatedPedestrianWindChillC, null);
});

test("missing shade still computes with reduced confidence", () => {
  const withShade = engine.evaluateSegment(makeInput({ shadeRatio: 0.2 }));
  const withoutShade = engine.evaluateSegment(makeInput({ shadeRatio: null }));

  assert.ok(withoutShade.totalComfortCost > 0);
  assert.ok(withoutShade.confidence < withShade.confidence);
});

test("missing wind still computes with reduced confidence", () => {
  const withWind = engine.evaluateSegment(makeInput({ windExposure: 4 }));
  const withoutWind = engine.evaluateSegment(makeInput({ windExposure: null }));

  assert.ok(withoutWind.totalComfortCost > 0);
  assert.ok(withoutWind.confidence < withWind.confidence);
});

test("missing wind does not become an ideal comparable route score", async () => {
  const service = new ComfortAnalysisService();
  const route = makeRoute(300, 300);
  const full = await service.analyzeRouteComfort({
    route,
    departureTime: "2026-01-15T18:00:00.000Z",
    weatherBundle: makeWeatherBundle(-8, 5),
    shadeAnalysis: makeShadeAnalysis(route, 300, 0.5),
    windAnalysis: makeWindAnalysis(route, 300, 5),
  });
  const missingWind = await service.analyzeRouteComfort({
    route,
    departureTime: "2026-01-15T18:00:00.000Z",
    weatherBundle: makeWeatherBundle(-8, 5),
    shadeAnalysis: makeShadeAnalysis(route, 300, 0.5),
    windAnalysis: null,
  });

  assert.equal(full.summary.scoreStatus, "complete");
  assert.equal(typeof full.summary.comfortScore, "number");
  assert.equal(missingWind.summary.scoreStatus, "partial");
  assert.equal(missingWind.summary.comfortScore, null);
  assert.equal(missingWind.completeness.windAvailable, false);
  assert.ok(missingWind.summary.averageComfortCost < full.summary.averageComfortCost);
});

test("missing shade does not become ideal sun or a comparable score", async () => {
  const service = new ComfortAnalysisService();
  const route = makeRoute(300, 300);
  const missingShade = await service.analyzeRouteComfort({
    route,
    departureTime: "2026-01-15T18:00:00.000Z",
    weatherBundle: makeWeatherBundle(-8, 5),
    shadeAnalysis: null,
    windAnalysis: makeWindAnalysis(route, 300, 5),
  });

  assert.equal(missingShade.summary.scoreStatus, "partial");
  assert.equal(missingShade.summary.comfortScore, null);
  assert.equal(missingShade.completeness.shadeAvailable, false);
  assert.equal(missingShade.summary.solarExposure, 0);
});

test("partial and full analyses are explicitly not comparable", async () => {
  const service = new ComfortAnalysisService();
  const route = makeRoute(300, 300);
  const full = await service.analyzeRouteComfort({
    route,
    departureTime: "2026-01-15T18:00:00.000Z",
    weatherBundle: makeWeatherBundle(-8, 5),
    shadeAnalysis: makeShadeAnalysis(route, 300, 0.5),
    windAnalysis: makeWindAnalysis(route, 300, 5),
  });
  const partial = await service.analyzeRouteComfort({
    route,
    departureTime: "2026-01-15T18:00:00.000Z",
    weatherBundle: makeWeatherBundle(-8, 5),
    shadeAnalysis: makeShadeAnalysis(route, 300, 0.5),
    windAnalysis: null,
  });

  assert.equal(full.completeness.comparable, true);
  assert.equal(partial.completeness.comparable, false);
  assert.ok(full.completeness.analyzedWeight > partial.completeness.analyzedWeight);
});

test("warmer temperature improves comfort in cold profile", () => {
  const cold = engine.evaluateSegment(makeInput({ temperatureC: -15 }));
  const warmer = engine.evaluateSegment(makeInput({ temperatureC: 5 }));

  assert.ok(warmer.totalComfortCost < cold.totalComfortCost);
});

test("longer exposure produces higher total cost under same poor conditions", async () => {
  const service = new ComfortAnalysisService();
  const short = await service.analyzeRouteComfort(makeRequest({ durationSeconds: 300 }));
  const long = await service.analyzeRouteComfort(makeRequest({ durationSeconds: 900 }));

  assert.ok(long.summary.totalComfortCost > short.summary.totalComfortCost);
  assert.ok(Math.abs(long.summary.averageComfortCost - short.summary.averageComfortCost) < 0.01);
});

test("comfort score mapping is monotonic with raw comfort cost", () => {
  assert.ok(engine.scoreFromAverageCost(1) >= engine.scoreFromAverageCost(2));
  assert.ok(engine.scoreFromAverageCost(2) >= engine.scoreFromAverageCost(6));
});

test("route ordering survives score mapping for open, mixed, and sheltered scenarios", () => {
  const open = engine.evaluateSegment(
    makeInput({ temperatureC: -10, windExposure: 8, headwind: 6, shadeRatio: 1 }),
  );
  const mixed = engine.evaluateSegment(
    makeInput({ temperatureC: -10, windExposure: 4, headwind: 2, shadeRatio: 0.5 }),
  );
  const sheltered = engine.evaluateSegment(
    makeInput({ temperatureC: -10, windExposure: 1, headwind: 0, shadeRatio: 0 }),
  );

  assert.ok(sheltered.comfortCostRate < mixed.comfortCostRate);
  assert.ok(mixed.comfortCostRate < open.comfortCostRate);
  assert.ok(engine.scoreFromAverageCost(sheltered.comfortCostRate) > engine.scoreFromAverageCost(mixed.comfortCostRate));
  assert.ok(engine.scoreFromAverageCost(mixed.comfortCostRate) > engine.scoreFromAverageCost(open.comfortCostRate));
});

test("raw cost preserves useful resolution for small realistic differences", () => {
  const windTwo = engine.evaluateSegment(makeInput({ windExposure: 2, headwind: 0.5 }));
  const windTwoPointFive = engine.evaluateSegment(
    makeInput({ windExposure: 2.5, headwind: 0.5 }),
  );
  const headwindHalf = engine.evaluateSegment(makeInput({ windExposure: 2, headwind: 0.5 }));
  const headwindOne = engine.evaluateSegment(makeInput({ windExposure: 2, headwind: 1 }));
  const shadeThirty = engine.evaluateSegment(makeInput({ shadeRatio: 0.3 }));
  const shadeSixty = engine.evaluateSegment(makeInput({ shadeRatio: 0.6 }));

  assert.ok(windTwoPointFive.comfortCostRate - windTwo.comfortCostRate > 0.05);
  assert.ok(headwindOne.comfortCostRate - headwindHalf.comfortCostRate > 0.05);
  assert.ok(shadeSixty.comfortCostRate - shadeThirty.comfortCostRate > 0.01);
});

test("mild complete conditions can have high comfort without saturation", async () => {
  const service = new ComfortAnalysisService();
  const route = makeRoute(300, 300);
  const result = await service.analyzeRouteComfort({
    route,
    departureTime: "2026-01-15T18:00:00.000Z",
    weatherBundle: makeWeatherBundle(8, 2),
    shadeAnalysis: makeShadeAnalysis(route, 300, 0.4),
    windAnalysis: makeWindAnalysis(route, 300, 2),
  });

  assert.equal(result.summary.scoreStatus, "complete");
  assert.ok((result.summary.comfortScore ?? 0) > 70);
  assert.ok((result.summary.comfortScore ?? 0) < 100);
});

test("severe cold conditions retain low-score headroom", () => {
  const severe = engine.evaluateSegment(
    makeInput({ temperatureC: -25, windExposure: 10, headwind: 8, shadeRatio: 1 }),
  );
  const sheltered = engine.evaluateSegment(
    makeInput({ temperatureC: -25, windExposure: 1.5, headwind: 0, shadeRatio: 0 }),
  );

  assert.ok(engine.scoreFromAverageCost(severe.comfortCostRate) < 25);
  assert.ok(engine.scoreFromAverageCost(sheltered.comfortCostRate) < 60);
  assert.ok(sheltered.comfortCostRate < severe.comfortCostRate);
});

test("confidence remains independent from comfort score and completeness", async () => {
  const service = new ComfortAnalysisService();
  const route = makeRoute(300, 300);
  const pleasantLowConfidence = await service.analyzeRouteComfort({
    route,
    departureTime: "2026-01-15T18:00:00.000Z",
    weatherBundle: makeWeatherBundle(8, 1),
    shadeAnalysis: makeShadeAnalysis(route, 300, 0.5, 0.2),
    windAnalysis: makeWindAnalysis(route, 300, 1, 0.2),
  });

  assert.equal(pleasantLowConfidence.summary.scoreStatus, "complete");
  assert.ok((pleasantLowConfidence.summary.comfortScore ?? 0) > 70);
  assert.ok(pleasantLowConfidence.summary.confidence < 0.45);
  assert.equal(pleasantLowConfidence.completeness.comparable, true);
});

test("wind exposure sweep monotonically worsens comfort", () => {
  const costs = [0, 2, 5, 10].map((windExposure) =>
    engine.evaluateSegment(makeInput({ windExposure })).comfortCostRate,
  );

  assert.deepEqual([...costs].sort((a, b) => a - b), costs);
});

test("temperature sweep generally improves cold-profile comfort as temperature rises", () => {
  const costs = [-20, -10, 0, 10].map((temperatureC) =>
    engine.evaluateSegment(makeInput({ temperatureC })).comfortCostRate,
  );

  assert.deepEqual([...costs].sort((a, b) => b - a), costs);
});

test("daytime winter shade sweep reduces solar benefit without discontinuous jumps", () => {
  const costs = [0, 0.5, 1].map((shadeRatio) =>
    engine.evaluateSegment(
      makeInput({ temperatureC: -5, shadeRatio, solarElevationDeg: 20 }),
    ).comfortCostRate,
  );

  assert.ok(costs[0] < costs[1]);
  assert.ok(costs[1] < costs[2]);
  assert.ok(costs[2] - costs[0] < 0.5);
});

test("night has no solar benefit", () => {
  const night = engine.evaluateSegment(makeInput({ shadeRatio: 0, solarElevationDeg: -4 }));
  const shadedNight = engine.evaluateSegment(
    makeInput({ shadeRatio: 1, solarElevationDeg: -4 }),
  );

  assert.equal(night.solarCost, 0);
  assert.equal(shadedNight.solarCost, 0);
});

test("wind chill is bounded to recognized validity range", () => {
  assert.equal(
    calculateEstimatedPedestrianWindChill({
      temperatureC: 12,
      pedestrianWindExposureMps: 8,
    }).valid,
    false,
  );
  assert.equal(
    calculateEstimatedPedestrianWindChill({
      temperatureC: -5,
      pedestrianWindExposureMps: 0.5,
    }).valid,
    false,
  );
  assert.equal(
    calculateEstimatedPedestrianWindChill({
      temperatureC: -5,
      pedestrianWindExposureMps: 5,
    }).valid,
    true,
  );
});

test("synthetic cold climate scenarios differentiate plausibly", () => {
  const veryColdWindy = engine.evaluateSegment(
    makeInput({ temperatureC: -20, windExposure: 9, headwind: 7, shadeRatio: 1 }),
  );
  const shelteredSunny = engine.evaluateSegment(
    makeInput({
      temperatureC: -8,
      windExposure: 1.5,
      headwind: 0,
      shadeRatio: 0,
      solarElevationDeg: 18,
    }),
  );
  const coldCalm = engine.evaluateSegment(
    makeInput({ temperatureC: -8, windExposure: 0.5, headwind: 0 }),
  );
  const mildWind = engine.evaluateSegment(
    makeInput({ temperatureC: 8, windExposure: 6, headwind: 4 }),
  );

  assert.ok(veryColdWindy.totalComfortCost > shelteredSunny.totalComfortCost);
  assert.ok(coldCalm.totalComfortCost < veryColdWindy.totalComfortCost);
  assert.ok(mildWind.totalComfortCost < veryColdWindy.totalComfortCost);
});

function makeInput(options: {
  temperatureC?: number;
  windExposure?: number | null;
  headwind?: number;
  crosswind?: number;
  shelterFactor?: number;
  shadeRatio?: number | null;
  solarElevationDeg?: number;
  durationSeconds?: number;
} = {}): SegmentComfortInput {
  const temperatureC = options.temperatureC ?? -8;
  const windExposure: number | null = Object.hasOwn(options, "windExposure")
    ? options.windExposure ?? null
    : 4;
  const headwind = options.headwind;
  const crosswind = options.crosswind ?? 0;
  const shelterFactor = options.shelterFactor ?? 0.2;
  const shadeRatio: number | null = Object.hasOwn(options, "shadeRatio")
    ? options.shadeRatio ?? null
    : 0.5;
  const solarElevationDeg = options.solarElevationDeg ?? 18;
  const durationSeconds = options.durationSeconds ?? 60;

  return {
    segmentId: "segment-1",
    distanceMeters: 80,
    durationSeconds,
    estimatedMidpointTime: "2026-01-15T18:00:00.000Z",
    weather: {
      temperatureC,
      regionalWindSpeedMps: windExposure ?? null,
      confidence: 0.8,
      selectionMethod: "current",
    },
    shade:
      shadeRatio === null
        ? undefined
        : {
            shadeRatio,
            confidence: 0.8,
            solarElevationDeg,
          },
    wind:
      windExposure === null
        ? undefined
        : {
            estimatedExposureMps: windExposure,
            headwindComponentMps: headwind ?? windExposure,
            crosswindComponentMps: crosswind,
            shelterFactor,
            confidence: 0.75,
          },
  };
}

function makeRequest({ durationSeconds }: { durationSeconds: number }): ComfortAnalysisRequest {
  const route = makeRoute(300, durationSeconds);
  return {
    route,
    departureTime: "2026-01-15T18:00:00.000Z",
    weatherBundle: makeWeatherBundle(-12, 5),
    shadeAnalysis: makeShadeAnalysis(route, durationSeconds, 0.8),
    windAnalysis: makeWindAnalysis(route, durationSeconds, 7),
  };
}

function makeRoute(distanceMeters: number, durationSeconds: number): RouteResult {
  return {
    geometry: makeRouteGeometry(distanceMeters),
    distanceMeters,
    durationSeconds,
  };
}

function makeRouteGeometry(distanceMeters: number): LineStringGeometry {
  const projection = createLocalProjection(ORIGIN);
  const start = projection.unproject([0, 0]);
  const end = projection.unproject([distanceMeters, 0]);

  return {
    type: "LineString",
    coordinates: [
      [start.longitude, start.latitude],
      [end.longitude, end.latitude],
    ],
  };
}

function makeWeatherBundle(temperatureC: number, windSpeedMps: number): WeatherBundle {
  return {
    coordinate: ORIGIN,
    current: null,
    hourlyForecast: [
      {
        timestamp: "2026-01-15T18:00:00.000Z",
        temperatureC,
        windSpeedMps,
        windDirectionDeg: 315,
      },
    ],
    alerts: [],
    source: "fixture",
    updatedAt: "2026-01-15T18:00:00.000Z",
  };
}

function makeShadeAnalysis(
  route: RouteResult,
  durationSeconds: number,
  shadeRatio: number,
  confidence = 0.8,
): ShadeAnalysisResult {
  return {
    status: "available",
    routeGeometry: route.geometry,
    departureTime: "2026-01-15T18:00:00.000Z",
    solarPosition: {
      azimuthDeg: 180,
      elevationDeg: 20,
      sunAboveHorizon: true,
      timestamp: "2026-01-15T18:00:00.000Z",
    },
    segments: [],
    segmentShade: [
      {
        segmentId: "segment-1",
        shadeRatio,
        shadedMeters: route.distanceMeters * shadeRatio,
        exposedMeters: route.distanceMeters * (1 - shadeRatio),
        totalMeters: route.distanceMeters,
        confidence,
        estimatedEntryTime: "2026-01-15T18:00:00.000Z",
        estimatedMidpointTime: new Date(
          Date.parse("2026-01-15T18:00:00.000Z") + (durationSeconds * 1000) / 2,
        ).toISOString(),
        estimatedExitTime: new Date(
          Date.parse("2026-01-15T18:00:00.000Z") + durationSeconds * 1000,
        ).toISOString(),
        solarElevationDeg: 20,
      },
    ],
    summary: {
      shadeRatio,
      shadedMeters: route.distanceMeters * shadeRatio,
      exposedMeters: route.distanceMeters * (1 - shadeRatio),
      analyzedMeters: route.distanceMeters,
      unknownMeters: 0,
      confidence,
    },
    coverage: {
      routeMeters: route.distanceMeters,
      analyzedMeters: route.distanceMeters,
      unknownMeters: 0,
      buildingCount: 1,
      usableBuildingCount: 1,
      explicitHeightBuildingCount: 1,
      floorDerivedHeightBuildingCount: 0,
      unknownHeightBuildingCount: 0,
    },
    quality: {
      geometryCoverage: 1,
      heightCoverage: 1,
      explicitHeightCoverage: 1,
      derivedHeightCoverage: 0,
      routeAnalysisCoverage: 1,
      overallConfidence: confidence,
    },
  };
}

function makeWindAnalysis(
  route: RouteResult,
  durationSeconds: number,
  exposureMps: number,
  confidence = 0.8,
): WindAnalysisResult {
  return {
    status: "available",
    routeGeometry: route.geometry,
    departureTime: "2026-01-15T18:00:00.000Z",
    segments: [],
    segmentWind: [
      {
        segmentId: "segment-1",
        regionalWindSpeedMps: exposureMps,
        regionalWindDirectionDeg: 315,
        windDataConfidence: confidence,
        segmentBearingDeg: 90,
        relativeWindAngleDeg: 90,
        headwindComponentMps: exposureMps,
        crosswindComponentMps: 0,
        tailwindComponentMps: 0,
        shelterFactor: 0,
        opennessFactor: 1,
        channelingFactor: 1,
        estimatedExposureMps: exposureMps,
        estimatedWindExposureMps: exposureMps,
        unknownMeters: 0,
        classification: "exposed",
        confidence,
        estimatedEntryTime: "2026-01-15T18:00:00.000Z",
        estimatedMidpointTime: new Date(
          Date.parse("2026-01-15T18:00:00.000Z") + (durationSeconds * 1000) / 2,
        ).toISOString(),
        estimatedExitTime: new Date(
          Date.parse("2026-01-15T18:00:00.000Z") + durationSeconds * 1000,
        ).toISOString(),
      },
    ],
    summary: {
      averageEstimatedExposureMps: exposureMps,
      averageHeadwindMps: exposureMps,
      averageCrosswindMps: 0,
      shelteredMeters: 0,
      neutralMeters: 0,
      exposedMeters: route.distanceMeters,
      analyzedMeters: route.distanceMeters,
      unknownMeters: 0,
      confidence,
    },
    coverage: {
      routeMeters: route.distanceMeters,
      analyzedMeters: route.distanceMeters,
      unknownMeters: 0,
      shelteredMeters: 0,
      neutralMeters: 0,
      exposedMeters: route.distanceMeters,
      buildingCount: 1,
      usableBuildingCount: 1,
      explicitHeightBuildingCount: 1,
      floorDerivedHeightBuildingCount: 0,
      unknownHeightBuildingCount: 0,
    },
    quality: {
      weatherConfidence: confidence,
      geometryCoverage: 1,
      heightCoverage: 1,
      shelterModelConfidence: 0.68,
      routeAnalysisCoverage: 1,
      overallConfidence: confidence,
    },
  };
}
