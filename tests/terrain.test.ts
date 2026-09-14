import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUsgs3DepSampleUrl,
  deriveTerrainSegment,
  parseUsgs3DepSamples,
} from "@/lib/environment/terrain/usgs3dep";
import {
  buildCenteredGrid,
  summarizeTerrain,
} from "@/scripts/build-usgs-terrain-pilot";

test("USGS 3DEP request keeps point order through location ids", () => {
  const points = [
    { longitude: -93.27, latitude: 44.98 },
    { longitude: -93.26, latitude: 44.97 },
  ];
  const url = buildUsgs3DepSampleUrl(points);
  assert.equal(url.hostname, "elevation.nationalmap.gov");
  assert.equal(url.searchParams.get("geometryType"), "esriGeometryMultipoint");

  const samples = parseUsgs3DepSamples(
    {
      samples: [
        {
          location: { x: -93.26, y: 44.97 },
          locationId: 1,
          value: "255.391235352",
          resolution: 1,
        },
        {
          location: { x: -93.27, y: 44.98 },
          locationId: 0,
          value: "257.489959717",
          resolution: 1,
        },
      ],
    },
    points,
  );
  assert.equal(samples[0].elevationMeters, 257.489959717);
  assert.equal(samples[1].elevationMeters, 255.391235352);
});

test("terrain grade and slope are derived from elevation over horizontal distance", () => {
  const terrain = deriveTerrainSegment(
    {
      latitude: 44.98,
      longitude: -93.27,
      elevationMeters: 250,
      sourceResolutionMeters: 10,
    },
    {
      latitude: 44.9808993,
      longitude: -93.27,
      elevationMeters: 260,
      sourceResolutionMeters: 10,
    },
  );
  assert.ok(terrain.horizontalDistanceMeters > 99);
  assert.ok(terrain.horizontalDistanceMeters < 101);
  assert.ok(terrain.grade > 0.099 && terrain.grade < 0.101);
  assert.ok(terrain.slopeDegrees > 5.7 && terrain.slopeDegrees < 5.8);
});

test("terrain pilot grid and summary remain deterministic", () => {
  const grid = buildCenteredGrid([-93.33, 44.93, -93.2, 45.02], 3, 50);
  assert.equal(grid.length, 9);
  const samples = grid.map((point, index) => ({
    ...point,
    elevationMeters: 250 + index,
    sourceResolutionMeters: 1,
  }));
  const summary = summarizeTerrain(samples, 3);
  assert.equal(summary.minimumElevationMeters, 250);
  assert.equal(summary.maximumElevationMeters, 258);
  assert.equal(summary.elevationRangeMeters, 8);
  assert.ok(summary.maximumSlopeDegrees > 3);
});

test("USGS 3DEP parser fails closed on missing samples", () => {
  assert.throws(
    () =>
      parseUsgs3DepSamples(
        {
          samples: [
            {
              location: { x: -93.27, y: 44.98 },
              locationId: 0,
              value: "257.4",
              resolution: 1,
            },
          ],
        },
        [
          { longitude: -93.27, latitude: 44.98 },
          { longitude: -93.26, latitude: 44.97 },
        ],
      ),
    /incomplete elevation coverage/,
  );
});
