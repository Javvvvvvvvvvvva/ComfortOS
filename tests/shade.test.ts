import assert from "node:assert/strict";
import test from "node:test";
import type { Polygon } from "geojson";
import { normalizeBuildingHeight } from "@/lib/environment/buildings/height";
import {
  normalizeOverpassBuildingResponse,
  buildOverpassQuery,
} from "@/lib/environment/buildings/providers/overpassBuildingProvider";
import { calculateSolarPosition } from "@/lib/environment/solar/solarPositionEngine";
import { createLocalProjection } from "@/lib/environment/shade/projection";
import {
  BuildingShadowEngine,
  calculateBuildingShadow,
  prepareShadowBuildingContext,
} from "@/lib/environment/shade/shadowEngine";
import {
  calculateSegmentShade,
  calculateUnknownHeightMeters,
  summarizeRouteShade,
} from "@/lib/environment/shade/shadeIntersectionEngine";
import {
  assignSegmentTraversalTimes,
  segmentRouteGeometry,
} from "@/lib/environment/shade/routeSegmentation";
import type { Building } from "@/lib/environment/buildings/types";
import type { SolarPosition } from "@/lib/environment/solar/solarPositionEngine";
import type { BuildingShadow, RouteSegment, TimedRouteSegment } from "@/lib/environment/shade/types";
import type { Coordinate, LineStringGeometry } from "@/lib/geo/types";

const ORIGIN: Coordinate = { latitude: 44.9778, longitude: -93.265 };

test("normalizes building height provenance honestly", () => {
  assert.deepEqual(normalizeBuildingHeight({ height: "30 m" }).heightSource, "provider");

  const floors = normalizeBuildingHeight({ floors: "4" });
  assert.equal(floors.heightMeters, 12);
  assert.equal(floors.heightSource, "floors-derived");
  assert.ok(floors.confidence < 0.8);

  const unknown = normalizeBuildingHeight({});
  assert.equal(unknown.heightMeters, null);
  assert.equal(unknown.heightSource, "unknown");
});

test("normalizes Overpass building geometry without leaking provider shape", () => {
  const buildings = normalizeOverpassBuildingResponse({
    elements: [
      {
        type: "way",
        id: 123,
        tags: { building: "yes", "building:levels": "3" },
        geometry: [
          { lat: 44.9778, lon: -93.265 },
          { lat: 44.9778, lon: -93.2649 },
          { lat: 44.9779, lon: -93.2649 },
          { lat: 44.9778, lon: -93.265 },
        ],
      },
    ],
  });

  assert.equal(buildings.length, 1);
  assert.equal(buildings[0].id, "way:123");
  assert.equal(buildings[0].heightMeters, 9);
  assert.equal(buildings[0].footprint.type, "Polygon");
});

test("builds Overpass bbox query in south, west, north, east order", () => {
  const query = buildOverpassQuery({
    west: -93.27,
    south: 44.97,
    east: -93.26,
    north: 44.98,
  });

  assert.match(query, /way\["building"\]\(44\.97,-93\.27,44\.98,-93\.26\)/);
  assert.match(query, /out tags geom/);
});

test("calculates deterministic solar position with ISO timestamps", () => {
  const solar = calculateSolarPosition({
    latitude: 44.9778,
    longitude: -93.265,
    timestamp: "2026-06-21T18:00:00.000Z",
  });

  assert.equal(solar.timestamp, "2026-06-21T18:00:00.000Z");
  assert.ok(solar.azimuthDeg >= 0 && solar.azimuthDeg < 360);
  assert.ok(solar.elevationDeg > 50);
  assert.equal(solar.sunAboveHorizon, true);
});

test("generates longer building shadows for taller buildings and lower sun", () => {
  const lowSun: SolarPosition = {
    azimuthDeg: 270,
    elevationDeg: 30,
    timestamp: "2026-08-08T23:00:00.000Z",
    sunAboveHorizon: true,
  };
  const highSun: SolarPosition = { ...lowSun, elevationDeg: 60 };
  const shortBuilding = makeFixtureBuilding(10);
  const tallBuilding = makeFixtureBuilding(20);

  const shortShadow = calculateBuildingShadow(shortBuilding, lowSun, ORIGIN)[0];
  const tallShadow = calculateBuildingShadow(tallBuilding, lowSun, ORIGIN)[0];
  const highSunShadow = calculateBuildingShadow(tallBuilding, highSun, ORIGIN)[0];

  assert.ok(shadowWidthMeters(tallShadow.geometry as Polygon) > shadowWidthMeters(shortShadow.geometry as Polygon));
  assert.ok(shadowWidthMeters(highSunShadow.geometry as Polygon) < shadowWidthMeters(tallShadow.geometry as Polygon));
});

test("prepared shadow building context preserves exact shadow geometry", () => {
  const buildings = [makeFixtureBuilding(10), makeFixtureBuilding(20)];
  const solar: SolarPosition = {
    azimuthDeg: 246,
    elevationDeg: 38,
    timestamp: "2026-08-08T23:00:00.000Z",
    sunAboveHorizon: true,
  };
  const engine = new BuildingShadowEngine();

  const direct = engine.calculateBuildingShadows(buildings, solar, ORIGIN);
  const prepared = engine.calculateBuildingShadows(
    buildings,
    solar,
    ORIGIN,
    prepareShadowBuildingContext(buildings, ORIGIN),
  );

  assert.deepEqual(prepared, direct);
});

test("targeted shadow generation preserves intersecting results and skips distant buildings", () => {
  const near = makeFixtureBuildingAt("near", 20, 0, 0);
  const far = makeFixtureBuildingAt("far", 20, 2_000, 2_000);
  const buildings = [near, far];
  const solar: SolarPosition = {
    azimuthDeg: 270,
    elevationDeg: 45,
    timestamp: "2026-08-08T23:00:00.000Z",
    sunAboveHorizon: true,
  };
  const target = makeSegment(-10, 5, 40, 5, 50).geometry;
  const engine = new BuildingShadowEngine();
  const prepared = prepareShadowBuildingContext(buildings, ORIGIN);

  const all = engine.calculateBuildingShadows(buildings, solar, ORIGIN, prepared);
  const targeted = engine.calculateBuildingShadows(
    buildings,
    solar,
    ORIGIN,
    prepared,
    target,
  );

  assert.deepEqual(
    targeted.shadows,
    all.shadows.filter((shadow) => shadow.buildingId === "near"),
  );
});

test("shade bbox prefilter preserves exact results with distant shadows", () => {
  const segment = makeSegment(0, 5, 100, 5, 100);
  const intersecting = makeShadow("near", makeRectangle(20, 0, 60, 10));
  const distant = makeShadow("far", makeRectangle(2_000, 2_000, 2_050, 2_050));

  const [withDistantShadow] = calculateSegmentShade(
    [segment],
    [intersecting, distant],
    ORIGIN,
  );
  const [withoutDistantShadow] = calculateSegmentShade([segment], [intersecting], ORIGIN);

  assert.deepEqual(withDistantShadow, withoutDistantShadow);
});

test("calculates segment shade from shadow geometry", () => {
  const projection = createLocalProjection(ORIGIN);
  const building = makeFixtureBuilding(10);
  const solar: SolarPosition = {
    azimuthDeg: 270,
    elevationDeg: 45,
    timestamp: "2026-08-08T23:00:00.000Z",
    sunAboveHorizon: true,
  };
  const [shadow] = calculateBuildingShadow(building, solar, ORIGIN);
  const start = projection.unproject([-10, 5]);
  const end = projection.unproject([30, 5]);
  const segment: RouteSegment = {
    id: "segment-1",
    geometry: {
      type: "LineString",
      coordinates: [
        [start.longitude, start.latitude],
        [end.longitude, end.latitude],
      ],
    },
    distanceMeters: 40,
    bearingDegrees: 90,
    startDistanceMeters: 0,
    endDistanceMeters: 40,
  };

  const [shade] = calculateSegmentShade([timeSegment(segment)], [shadow], ORIGIN);
  assert.ok(shade.shadeRatio > 0.35 && shade.shadeRatio < 0.65);
  assert.ok(shade.exposedMeters > 0);
});

test("exact shade clips a half-covered segment", () => {
  const segment = makeSegment(-10, 5, 30, 5, 40);
  const shadow = makeShadow("half", makeRectangle(10, 0, 30, 10));

  const [shade] = calculateSegmentShade([segment], [shadow], ORIGIN);

  assert.equal(Math.round(shade.shadedMeters), 20);
  assert.equal(Math.round(shade.exposedMeters), 20);
  assert.ok(Math.abs(shade.shadeRatio - 0.5) < 0.001);
});

test("overlapping shadows count once", () => {
  const segment = makeSegment(0, 5, 60, 5, 60);
  const shadows = [
    makeShadow("a", makeRectangle(0, 0, 40, 10)),
    makeShadow("b", makeRectangle(20, 0, 60, 10)),
  ];

  const [shade] = calculateSegmentShade([segment], shadows, ORIGIN);

  assert.equal(Math.round(shade.shadedMeters), 60);
  assert.equal(shade.shadeRatio, 1);
});

test("disjoint shaded portions are unioned along the route", () => {
  const segment = makeSegment(0, 5, 100, 5, 100);
  const shadows = [
    makeShadow("a", makeRectangle(10, 0, 30, 10)),
    makeShadow("b", makeRectangle(70, 0, 90, 10)),
  ];

  const [shade] = calculateSegmentShade([segment], shadows, ORIGIN);

  assert.equal(Math.round(shade.shadedMeters), 40);
  assert.ok(Math.abs(shade.shadeRatio - 0.4) < 0.001);
});

test("shadow boundary touch is not material shade", () => {
  const segment = makeSegment(0, 10, 40, 10, 40);
  const shadow = makeShadow("edge", makeRectangle(0, 0, 40, 10));

  const [shade] = calculateSegmentShade([segment], [shadow], ORIGIN);

  assert.equal(shade.shadedMeters, 0);
  assert.equal(shade.shadeRatio, 0);
});

test("exact shade supports multipolygon shadows", () => {
  const segment = makeSegment(0, 5, 100, 5, 100);
  const shadow: BuildingShadow = {
    buildingId: "multi",
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        makeRectangle(10, 0, 30, 10).coordinates,
        makeRectangle(60, 0, 80, 10).coordinates,
      ],
    },
    sourceHeightMeters: 12,
    confidence: 0.8,
  };

  const [shade] = calculateSegmentShade([segment], [shadow], ORIGIN);

  assert.equal(Math.round(shade.shadedMeters), 40);
});

test("segments routes, timestamps traversal, and aggregates route shade by distance", () => {
  const projection = createLocalProjection(ORIGIN);
  const a = projection.unproject([0, 0]);
  const b = projection.unproject([95, 0]);
  const route: LineStringGeometry = {
    type: "LineString",
    coordinates: [
      [a.longitude, a.latitude],
      [b.longitude, b.latitude],
    ],
  };
  const segments = segmentRouteGeometry(route, 30);
  assert.equal(segments.length, 4);
  const timedSegments = assignSegmentTraversalTimes({
    segments,
    departureTime: "2026-08-08T18:00:00.000Z",
    routeDurationSeconds: 400,
  });
  assert.equal(timedSegments[0].estimatedEntryTime, "2026-08-08T18:00:00.000Z");
  assert.equal(timedSegments[3].estimatedExitTime, "2026-08-08T18:06:40.000Z");
  assert.ok(
    Date.parse(timedSegments[1].estimatedMidpointTime) >
      Date.parse(timedSegments[0].estimatedMidpointTime),
  );

  const { summary } = summarizeRouteShade({
    routeMeters: 100,
    buildings: [makeFixtureBuilding(10), makeFixtureBuilding(null)],
    segmentShade: [
      { segmentId: "a", shadeRatio: 1, shadedMeters: 25, exposedMeters: 0, totalMeters: 25, confidence: 0.8 },
      { segmentId: "b", shadeRatio: 0, shadedMeters: 0, exposedMeters: 75, totalMeters: 75, confidence: 0.8 },
    ],
    unknownMeters: 25,
  });

  assert.equal(summary.shadeRatio, 0.25);
  assert.equal(summary.unknownMeters, 25);
  assert.ok(summary.confidence < 0.8);
});

test("solar position changes with segment traversal time", () => {
  const segments = [
    { ...makeSegment(0, 0, 10, 0, 10, "early"), startDistanceMeters: 0, endDistanceMeters: 10 },
    { ...makeSegment(10, 0, 20, 0, 10, "late"), startDistanceMeters: 10, endDistanceMeters: 20 },
  ];
  const timed = assignSegmentTraversalTimes({
    segments,
    departureTime: "2026-08-08T18:00:00.000Z",
    routeDurationSeconds: 7200,
  });
  const earlySolar = calculateSolarPosition({
    latitude: ORIGIN.latitude,
    longitude: ORIGIN.longitude,
    timestamp: timed[0].estimatedMidpointTime,
  });
  const lateSolar = calculateSolarPosition({
    latitude: ORIGIN.latitude,
    longitude: ORIGIN.longitude,
    timestamp: timed[1].estimatedMidpointTime,
  });

  assert.notEqual(earlySolar.azimuthDeg.toFixed(3), lateSolar.azimuthDeg.toFixed(3));
});

test("route shade can change across traversal when segment time changes shadows", () => {
  const segment = makeSegment(0, 5, 100, 5, 100);
  const morningShadow = makeShadow("morning", makeRectangle(0, 0, 80, 10));
  const noonShadow = makeShadow("noon", makeRectangle(0, 0, 20, 10));

  const [morningShade] = calculateSegmentShade([segment], [morningShadow], ORIGIN);
  const [noonShade] = calculateSegmentShade([segment], [noonShadow], ORIGIN);

  assert.ok(morningShade.shadeRatio > noonShade.shadeRatio);
});

test("unknown height uncertainty is route-adjacent geometry, not whole-route count", () => {
  const segment = makeSegment(0, 5, 100, 5, 100);
  const unknownNearRoute = {
    ...makeFixtureBuilding(null),
    footprint: makeRectangle(40, 0, 50, 10),
  };
  const unknownMeters = calculateUnknownHeightMeters({
    segments: [segment],
    buildings: [unknownNearRoute],
    projectionOrigin: ORIGIN,
  });

  assert.ok(unknownMeters > 10);
  assert.ok(unknownMeters < 100);
});

test("zero-duration malformed route timing remains deterministic", () => {
  const timed = assignSegmentTraversalTimes({
    segments: [makeSegment(0, 0, 10, 0, 10)],
    departureTime: "2026-08-08T18:00:00.000Z",
    routeDurationSeconds: 0,
  });

  assert.equal(timed[0].estimatedEntryTime, "2026-08-08T18:00:00.000Z");
  assert.equal(timed[0].estimatedExitTime, "2026-08-08T18:00:00.000Z");
  assert.match(timed[0].estimatedMidpointTime, /^\d{4}-\d{2}-\d{2}T/);
});

test("sun below horizon is explicit", () => {
  const night = calculateSolarPosition({
    latitude: 44.9778,
    longitude: -93.265,
    timestamp: "2026-06-21T06:00:00.000Z",
  });

  assert.equal(night.sunAboveHorizon, false);
});

function makeFixtureBuilding(heightMeters: number | null): Building {
  return makeFixtureBuildingAt(`building-${heightMeters ?? "unknown"}`, heightMeters, 0, 0);
}

function makeFixtureBuildingAt(
  id: string,
  heightMeters: number | null,
  offsetX: number,
  offsetY: number,
): Building {
  const projection = createLocalProjection(ORIGIN);
  const ring = [
    [offsetX, offsetY],
    [offsetX + 10, offsetY],
    [offsetX + 10, offsetY + 10],
    [offsetX, offsetY + 10],
    [offsetX, offsetY],
  ].map(([x, y]) => {
    const coordinate = projection.unproject([x, y]);
    return [coordinate.longitude, coordinate.latitude] as [number, number];
  });

  return {
    id,
    footprint: { type: "Polygon", coordinates: [ring] },
    heightMeters,
    minHeightMeters: null,
    floors: null,
    source: "fixture",
    confidence: heightMeters ? 0.8 : 0.25,
    heightSource: heightMeters ? "provider" : "unknown",
  };
}

function timeSegment(segment: RouteSegment): TimedRouteSegment {
  return {
    ...segment,
    estimatedEntryTime: "2026-08-08T18:00:00.000Z",
    estimatedExitTime: "2026-08-08T18:01:00.000Z",
    estimatedMidpointTime: "2026-08-08T18:00:30.000Z",
  };
}

function makeSegment(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  distanceMeters: number,
  id = "segment-1",
): TimedRouteSegment {
  const projection = createLocalProjection(ORIGIN);
  const start = projection.unproject([startX, startY]);
  const end = projection.unproject([endX, endY]);

  return {
    id,
    geometry: {
      type: "LineString",
      coordinates: [
        [start.longitude, start.latitude],
        [end.longitude, end.latitude],
      ],
    },
    distanceMeters,
    bearingDegrees: 90,
    startDistanceMeters: 0,
    endDistanceMeters: distanceMeters,
    estimatedEntryTime: "2026-08-08T18:00:00.000Z",
    estimatedExitTime: "2026-08-08T18:01:00.000Z",
    estimatedMidpointTime: "2026-08-08T18:00:30.000Z",
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

function makeShadow(id: string, geometry: Polygon): BuildingShadow {
  return {
    buildingId: id,
    geometry,
    sourceHeightMeters: 12,
    confidence: 0.8,
  };
}

function shadowWidthMeters(polygon: Polygon) {
  const projection = createLocalProjection(ORIGIN);
  const xs = polygon.coordinates[0].map(([longitude, latitude]) =>
    projection.project({ latitude, longitude })[0],
  );
  return Math.max(...xs) - Math.min(...xs);
}
