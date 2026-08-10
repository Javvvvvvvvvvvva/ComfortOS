import assert from "node:assert/strict";
import test from "node:test";
import type { Polygon } from "geojson";
import type { Building, BuildingProvider } from "@/lib/environment/buildings/types";
import { createLocalProjection } from "@/lib/environment/shade/projection";
import type { TimedRouteSegment } from "@/lib/environment/shade/types";
import { HeuristicUrbanWindModel } from "@/lib/environment/wind/urbanWindModel";
import { WindAnalysisService } from "@/lib/environment/wind/windService";
import {
  calculateWindComponents,
  selectWindStateForTime,
} from "@/lib/environment/wind/windVector";
import type { Coordinate, LineStringGeometry } from "@/lib/geo/types";
import type { WeatherBundle } from "@/lib/weather/types";

const ORIGIN: Coordinate = { latitude: 44.9778, longitude: -93.265 };

test("meteorological north wind is headwind for northbound pedestrians", () => {
  const components = calculateWindComponents({
    pedestrianBearingDeg: 0,
    windFromDeg: 0,
    windSpeedMps: 5,
  });

  assert.equal(components.headwindComponentMps, 5);
  assert.equal(components.tailwindComponentMps, 0);
  assert.ok(components.crosswindComponentMps < 0.001);
});

test("meteorological north wind is tailwind for southbound pedestrians", () => {
  const components = calculateWindComponents({
    pedestrianBearingDeg: 180,
    windFromDeg: 0,
    windSpeedMps: 5,
  });

  assert.equal(components.tailwindComponentMps, 5);
  assert.equal(components.headwindComponentMps, 0);
  assert.ok(components.crosswindComponentMps < 0.001);
});

test("meteorological north wind is crosswind for eastbound pedestrians", () => {
  const components = calculateWindComponents({
    pedestrianBearingDeg: 90,
    windFromDeg: 0,
    windSpeedMps: 5,
  });

  assert.ok(components.crosswindComponentMps > 4.99);
  assert.ok(components.headwindComponentMps < 0.001);
  assert.ok(components.tailwindComponentMps < 0.001);
});

test("meteorological west and east winds decompose correctly for westbound pedestrians", () => {
  const westHeadwind = calculateWindComponents({
    pedestrianBearingDeg: 270,
    windFromDeg: 270,
    windSpeedMps: 5,
  });
  const eastTailwind = calculateWindComponents({
    pedestrianBearingDeg: 270,
    windFromDeg: 90,
    windSpeedMps: 5,
  });

  assert.equal(westHeadwind.headwindComponentMps, 5);
  assert.equal(westHeadwind.tailwindComponentMps, 0);
  assert.equal(eastTailwind.tailwindComponentMps, 5);
  assert.equal(eastTailwind.headwindComponentMps, 0);
});

test("zero wind yields zero directional components", () => {
  const components = calculateWindComponents({
    pedestrianBearingDeg: 90,
    windFromDeg: 0,
    windSpeedMps: 0,
  });

  assert.equal(components.headwindComponentMps, 0);
  assert.equal(components.crosswindComponentMps, 0);
  assert.equal(components.tailwindComponentMps, 0);
});

test("building directly upwind increases shelter compared with open condition", () => {
  const model = new HeuristicUrbanWindModel();
  const segment = makeSegment(-20, 0, 20, 0, 40, 90);
  const open = model.estimateSegmentWind(segment, northWind(), {
    buildings: [],
    projectionOrigin: ORIGIN,
  });
  const sheltered = model.estimateSegmentWind(segment, northWind(), {
    buildings: [makeBuilding("upwind", -8, 18, 8, 30, 18)],
    projectionOrigin: ORIGIN,
  });

  assert.ok(sheltered.shelterFactor > open.shelterFactor);
  assert.ok(sheltered.estimatedExposureMps < open.estimatedExposureMps);
});

test("building downwind does not provide upwind shelter", () => {
  const model = new HeuristicUrbanWindModel();
  const segment = makeSegment(-20, 0, 20, 0, 40, 90);
  const wind = model.estimateSegmentWind(segment, northWind(), {
    buildings: [makeBuilding("downwind", -8, -30, 8, -18, 18)],
    projectionOrigin: ORIGIN,
  });

  assert.equal(wind.shelterFactor, 0);
});

test("taller building creates stronger shelter potential", () => {
  const model = new HeuristicUrbanWindModel();
  const segment = makeSegment(-20, 0, 20, 0, 40, 90);
  const short = model.estimateSegmentWind(segment, northWind(), {
    buildings: [makeBuilding("short", -8, 18, 8, 30, 6)],
    projectionOrigin: ORIGIN,
  });
  const tall = model.estimateSegmentWind(segment, northWind(), {
    buildings: [makeBuilding("tall", -8, 18, 8, 30, 24)],
    projectionOrigin: ORIGIN,
  });

  assert.ok(tall.shelterFactor > short.shelterFactor);
});

test("shelter decays with distance and lateral offset", () => {
  const model = new HeuristicUrbanWindModel();
  const segment = makeSegment(-20, 0, 20, 0, 40, 90);
  const near = model.estimateSegmentWind(segment, northWind(), {
    buildings: [makeBuilding("near", -8, 18, 8, 30, 18)],
    projectionOrigin: ORIGIN,
  });
  const far = model.estimateSegmentWind(segment, northWind(), {
    buildings: [makeBuilding("far", -8, 120, 8, 132, 18)],
    projectionOrigin: ORIGIN,
  });
  const lateral = model.estimateSegmentWind(segment, northWind(), {
    buildings: [makeBuilding("lateral", 80, 18, 96, 30, 18)],
    projectionOrigin: ORIGIN,
  });

  assert.ok(near.shelterFactor > far.shelterFactor);
  assert.equal(far.shelterFactor, 0);
  assert.equal(lateral.shelterFactor, 0);
});

test("wider building creates broader lateral shelter", () => {
  const model = new HeuristicUrbanWindModel();
  const offsetSegment = makeSegment(20, 0, 60, 0, 40, 90);
  const narrow = model.estimateSegmentWind(offsetSegment, northWind(), {
    buildings: [makeBuilding("narrow", -4, 18, 4, 30, 18)],
    projectionOrigin: ORIGIN,
  });
  const wide = model.estimateSegmentWind(offsetSegment, northWind(), {
    buildings: [makeBuilding("wide", -28, 18, 28, 30, 18)],
    projectionOrigin: ORIGIN,
  });

  assert.ok(wide.shelterFactor > narrow.shelterFactor);
});

test("unknown building height does not generate high-confidence shelter", () => {
  const model = new HeuristicUrbanWindModel();
  const segment = makeSegment(-20, 0, 20, 0, 40, 90);
  const wind = model.estimateSegmentWind(segment, northWind(), {
    buildings: [makeBuilding("unknown", -8, 18, 8, 30, null)],
    projectionOrigin: ORIGIN,
  });

  assert.equal(wind.shelterFactor, 0);
  assert.ok(wind.confidence < 0.5);
});

test("street canyon aligned with wind applies capped channeling", () => {
  const model = new HeuristicUrbanWindModel();
  const segment = makeSegment(0, 20, 0, -20, 40, 180);
  const wind = model.estimateSegmentWind(segment, northWind(), {
    buildings: [
      makeBuilding("left", -30, -15, -18, 15, 18),
      makeBuilding("right", 18, -15, 30, 15, 18),
    ],
    projectionOrigin: ORIGIN,
  });

  assert.ok(wind.opennessFactor < 0.5);
  assert.ok(wind.channelingFactor > 1);
  assert.ok(wind.channelingFactor <= 1.12);
});

test("channeling only applies for aligned canyon conditions", () => {
  const model = new HeuristicUrbanWindModel();
  const alignedCanyon = makeSegment(0, 20, 0, -20, 40, 180);
  const perpendicularCanyon = makeSegment(-20, 0, 20, 0, 40, 90);
  const canyonBuildings = [
    makeBuilding("left", -30, -15, -18, 15, 18),
    makeBuilding("right", 18, -15, 30, 15, 18),
  ];
  const open = model.estimateSegmentWind(alignedCanyon, northWind(), {
    buildings: [],
    projectionOrigin: ORIGIN,
  });
  const aligned = model.estimateSegmentWind(alignedCanyon, northWind(), {
    buildings: canyonBuildings,
    projectionOrigin: ORIGIN,
  });
  const perpendicular = model.estimateSegmentWind(perpendicularCanyon, northWind(), {
    buildings: canyonBuildings,
    projectionOrigin: ORIGIN,
  });
  const oneSided = model.estimateSegmentWind(alignedCanyon, northWind(), {
    buildings: [canyonBuildings[0]],
    projectionOrigin: ORIGIN,
  });
  const isolated = model.estimateSegmentWind(alignedCanyon, northWind(), {
    buildings: [makeBuilding("isolated", -8, 40, 8, 52, 18)],
    projectionOrigin: ORIGIN,
  });

  assert.equal(open.channelingFactor, 1);
  assert.ok(aligned.channelingFactor > 1);
  assert.equal(perpendicular.channelingFactor, 1);
  assert.equal(oneSided.channelingFactor, 1);
  assert.equal(isolated.channelingFactor, 1);
});

test("segment-time weather selection interpolates hourly wind", () => {
  const weather = makeWeatherBundle([
    ["2026-08-08T18:00:00.000Z", 2, 350],
    ["2026-08-08T19:00:00.000Z", 6, 10],
  ]);
  const wind = selectWindStateForTime(weather, "2026-08-08T18:30:00.000Z");

  assert.equal(wind?.selectionMethod, "interpolated-hourly");
  assert.equal(wind?.speedMps, 4);
  assert.equal(Math.round(wind?.directionFromDeg ?? 0), 0);
});

test("route exposure increases monotonically with regional wind speed", async () => {
  const service = new WindAnalysisService(makeBuildingProvider([]), undefined, undefined, 0);
  const route = {
    geometry: makeRouteGeometry(0, 0, 100, 0),
    distanceMeters: 100,
    durationSeconds: 120,
  };
  const exposures = await Promise.all(
    [0, 2, 5, 10].map(async (speed) => {
      const result = await service.analyzeRouteWind({
        route,
        departureTime: "2026-08-08T18:00:00.000Z",
        weatherBundle: makeWeatherBundle([["2026-08-08T18:00:00.000Z", speed, 90]]),
      });
      return result.summary.averageEstimatedExposureMps;
    }),
  );

  assert.deepEqual(exposures.map((value) => Math.round(value * 100) / 100), [0, 2, 5, 10]);
});

test("route wind uses segment traversal time across changing forecasts", async () => {
  const service = new WindAnalysisService(makeBuildingProvider([]), undefined, undefined, 0);
  const result = await service.analyzeRouteWind({
    route: {
      geometry: makeRouteGeometry(0, 0, 3000, 0),
      distanceMeters: 3000,
      durationSeconds: 7200,
    },
    departureTime: "2026-08-08T18:00:00.000Z",
    weatherBundle: makeWeatherBundle([
      ["2026-08-08T18:00:00.000Z", 2, 90],
      ["2026-08-08T20:00:00.000Z", 8, 90],
    ]),
  });
  const first = result.segmentWind[0];
  const last = result.segmentWind.at(-1);

  assert.ok(first.regionalWindSpeedMps < last!.regionalWindSpeedMps);
  assert.ok(result.summary.averageEstimatedExposureMps > first.regionalWindSpeedMps);
  assert.ok(result.summary.averageEstimatedExposureMps < last!.regionalWindSpeedMps);
});

test("wind service aggregates distance-weighted route metrics and direction switch changes state", async () => {
  const routeGeometry = makeRouteGeometry(0, 0, 100, 0);
  const provider = makeBuildingProvider([
    makeBuilding("north", 40, 18, 60, 30, 18),
    makeBuilding("south", 40, -30, 60, -18, 18),
  ]);
  const service = new WindAnalysisService(provider, undefined, undefined, 0);
  const baseRoute = {
    geometry: routeGeometry,
    distanceMeters: 100,
    durationSeconds: 120,
  };

  const north = await service.analyzeRouteWind({
    route: baseRoute,
    departureTime: "2026-08-08T18:00:00.000Z",
    weatherBundle: makeWeatherBundle([["2026-08-08T18:00:00.000Z", 5, 0]]),
  });
  const east = await service.analyzeRouteWind({
    route: baseRoute,
    departureTime: "2026-08-08T18:00:00.000Z",
    weatherBundle: makeWeatherBundle([["2026-08-08T18:00:00.000Z", 5, 90]]),
  });

  assert.ok(north.summary.averageCrosswindMps > 4.5);
  assert.ok(east.summary.averageHeadwindMps > 4.5);
  assert.notEqual(
    north.segmentWind.map((segment) => segment.shelterFactor.toFixed(3)).join(","),
    east.segmentWind.map((segment) => segment.shelterFactor.toFixed(3)).join(","),
  );
  assert.ok(north.summary.confidence > 0);
  const accountedMeters =
    north.summary.shelteredMeters +
    north.summary.neutralMeters +
    north.summary.exposedMeters +
    north.summary.unknownMeters;
  assert.ok(Math.abs(accountedMeters - north.coverage.routeMeters) < 0.01);
});

test("wind analysis fails honestly when wind speed or direction is missing", async () => {
  const service = new WindAnalysisService(makeBuildingProvider([]), undefined, undefined, 0);
  await assert.rejects(
    service.analyzeRouteWind({
      route: {
        geometry: makeRouteGeometry(0, 0, 100, 0),
        distanceMeters: 100,
        durationSeconds: 120,
      },
      departureTime: "2026-08-08T18:00:00.000Z",
      weatherBundle: {
        coordinate: ORIGIN,
        current: null,
        hourlyForecast: [{ timestamp: "2026-08-08T18:00:00.000Z", windSpeedMps: 5 }],
        alerts: [],
        source: "fixture",
        updatedAt: "2026-08-08T18:00:00.000Z",
      },
    }),
    /Wind data unavailable/,
  );
});

test("wind analysis fails honestly when weather provider cannot load wind", async () => {
  const service = new WindAnalysisService(
    makeBuildingProvider([]),
    {
      async getWeatherBundle() {
        throw new Error("weather unavailable");
      },
    } as never,
    undefined,
    0,
  );

  await assert.rejects(
    service.analyzeRouteWind({
      route: {
        geometry: makeRouteGeometry(0, 200, 100, 200),
        distanceMeters: 100,
        durationSeconds: 120,
      },
      departureTime: "2026-08-08T18:00:00.000Z",
    }),
    /weather unavailable/,
  );
});

test("wind analysis fails honestly when building provider cannot load footprints", async () => {
  const service = new WindAnalysisService(
    {
      async getBuildings() {
        throw new Error("buildings unavailable");
      },
    },
    undefined,
    undefined,
    0,
  );

  await assert.rejects(
    service.analyzeRouteWind({
      route: {
        geometry: makeRouteGeometry(0, 400, 100, 400),
        distanceMeters: 100,
        durationSeconds: 120,
      },
      departureTime: "2026-08-08T18:00:00.000Z",
      weatherBundle: makeWeatherBundle([["2026-08-08T18:00:00.000Z", 5, 0]]),
    }),
    /buildings unavailable/,
  );
});

test("wind analysis remains available with no nearby buildings", async () => {
  const service = new WindAnalysisService(makeBuildingProvider([]), undefined, undefined, 0);
  const result = await service.analyzeRouteWind({
    route: {
      geometry: makeRouteGeometry(0, 600, 100, 600),
      distanceMeters: 100,
      durationSeconds: 120,
    },
    departureTime: "2026-08-08T18:00:00.000Z",
    weatherBundle: makeWeatherBundle([["2026-08-08T18:00:00.000Z", 5, 0]]),
  });

  assert.equal(result.status, "available");
  assert.equal(result.coverage.buildingCount, 0);
  assert.equal(result.summary.unknownMeters, 0);
  assert.equal(result.quality.heightCoverage, 1);
});

test("wind analysis tolerates malformed building geometry", async () => {
  const malformed = {
    ...makeBuilding("bad", 0, 0, 1, 1, 12),
    footprint: { type: "Polygon", coordinates: [] } as unknown as Polygon,
  };
  const service = new WindAnalysisService(
    makeBuildingProvider([malformed]),
    undefined,
    undefined,
    0,
  );
  const result = await service.analyzeRouteWind({
    route: {
      geometry: makeRouteGeometry(0, 0, 100, 0),
      distanceMeters: 100,
      durationSeconds: 120,
    },
    departureTime: "2026-08-08T18:00:00.000Z",
    weatherBundle: makeWeatherBundle([["2026-08-08T18:00:00.000Z", 5, 0]]),
  });

  assert.equal(result.status, "available");
  assert.equal(result.summary.shelteredMeters, 0);
});

function northWind() {
  return {
    timestamp: "2026-08-08T18:00:00.000Z",
    speedMps: 5,
    directionFromDeg: 0,
    source: "fixture",
    confidence: 0.8,
    selectionMethod: "current" as const,
  };
}

function makeSegment(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  distanceMeters: number,
  bearingDegrees: number,
): TimedRouteSegment {
  const projection = createLocalProjection(ORIGIN);
  const start = projection.unproject([startX, startY]);
  const end = projection.unproject([endX, endY]);

  return {
    id: "segment-1",
    geometry: {
      type: "LineString",
      coordinates: [
        [start.longitude, start.latitude],
        [end.longitude, end.latitude],
      ],
    },
    distanceMeters,
    bearingDegrees,
    startDistanceMeters: 0,
    endDistanceMeters: distanceMeters,
    estimatedEntryTime: "2026-08-08T18:00:00.000Z",
    estimatedMidpointTime: "2026-08-08T18:01:00.000Z",
    estimatedExitTime: "2026-08-08T18:02:00.000Z",
  };
}

function makeRouteGeometry(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): LineStringGeometry {
  const projection = createLocalProjection(ORIGIN);
  const start = projection.unproject([startX, startY]);
  const end = projection.unproject([endX, endY]);

  return {
    type: "LineString",
    coordinates: [
      [start.longitude, start.latitude],
      [end.longitude, end.latitude],
    ],
  };
}

function makeBuilding(
  id: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  heightMeters: number | null,
): Building {
  return {
    id,
    footprint: makeRectangle(minX, minY, maxX, maxY),
    heightMeters,
    minHeightMeters: null,
    floors: heightMeters ? heightMeters / 3 : null,
    source: "fixture",
    confidence: heightMeters ? 0.8 : 0.2,
    heightSource: heightMeters ? "provider" : "unknown",
  };
}

function makeRectangle(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Polygon {
  const projection = createLocalProjection(ORIGIN);
  const ring = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ].map(([x, y]) => {
    const coordinate = projection.unproject([x, y]);
    return [coordinate.longitude, coordinate.latitude] as [number, number];
  });

  return { type: "Polygon", coordinates: [ring] };
}

function makeWeatherBundle(points: Array<[string, number, number]>): WeatherBundle {
  return {
    coordinate: ORIGIN,
    current: null,
    hourlyForecast: points.map(([timestamp, windSpeedMps, windDirectionDeg]) => ({
      timestamp,
      windSpeedMps,
      windDirectionDeg,
    })),
    alerts: [],
    source: "fixture",
    updatedAt: "2026-08-08T18:00:00.000Z",
  };
}

function makeBuildingProvider(buildings: Building[]): BuildingProvider {
  return {
    async getBuildings() {
      return buildings;
    },
  };
}
