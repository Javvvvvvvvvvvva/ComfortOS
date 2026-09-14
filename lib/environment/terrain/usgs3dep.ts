import type { Coordinate } from "@/lib/geo/types";

export const USGS_3DEP_IMAGE_SERVICE =
  "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer";
export const USGS_3DEP_DATA_AS_OF = "2026-08-24";
export const USGS_3DEP_VERSION = "service-2026-08-24";

export type TerrainElevationSample = Coordinate & {
  elevationMeters: number;
  sourceResolutionMeters: number;
};

export type TerrainSegment = {
  horizontalDistanceMeters: number;
  elevationChangeMeters: number;
  grade: number;
  slopeDegrees: number;
};

export function buildUsgs3DepSampleUrl(points: Coordinate[]) {
  if (points.length === 0 || points.length > 1_000) {
    throw new Error("USGS 3DEP sample requests require 1-1000 points.");
  }
  points.forEach(assertCoordinate);

  const url = new URL(`${USGS_3DEP_IMAGE_SERVICE}/getSamples`);
  url.searchParams.set(
    "geometry",
    JSON.stringify({
      points: points.map((point) => [point.longitude, point.latitude]),
      spatialReference: { wkid: 4326 },
    }),
  );
  url.searchParams.set("geometryType", "esriGeometryMultipoint");
  url.searchParams.set("returnFirstValueOnly", "true");
  url.searchParams.set("f", "json");
  return url;
}

export function parseUsgs3DepSamples(
  value: unknown,
  expectedPoints: Coordinate[],
): TerrainElevationSample[] {
  const response = asRecord(value, "USGS 3DEP response");
  if (!Array.isArray(response.samples)) {
    throw new Error("USGS 3DEP response did not contain samples.");
  }

  const byLocation = new Map<number, TerrainElevationSample>();
  for (const rawSample of response.samples) {
    const sample = asRecord(rawSample, "USGS 3DEP sample");
    const location = asRecord(sample.location, "USGS 3DEP sample location");
    const locationId = sample.locationId;
    const elevationMeters = Number(sample.value);
    const sourceResolutionMeters = Number(sample.resolution);
    if (
      !Number.isInteger(locationId) ||
      (locationId as number) < 0 ||
      (locationId as number) >= expectedPoints.length ||
      !Number.isFinite(elevationMeters) ||
      !Number.isFinite(sourceResolutionMeters) ||
      sourceResolutionMeters <= 0 ||
      !Number.isFinite(location.x) ||
      !Number.isFinite(location.y)
    ) {
      throw new Error("USGS 3DEP returned an invalid sample.");
    }
    if (byLocation.has(locationId as number)) {
      throw new Error("USGS 3DEP returned a duplicate sample location.");
    }

    const expected = expectedPoints[locationId as number];
    if (
      Math.abs((location.x as number) - expected.longitude) > 1e-5 ||
      Math.abs((location.y as number) - expected.latitude) > 1e-5
    ) {
      throw new Error("USGS 3DEP sample location did not match its request.");
    }
    byLocation.set(locationId as number, {
      longitude: location.x as number,
      latitude: location.y as number,
      elevationMeters,
      sourceResolutionMeters,
    });
  }

  if (byLocation.size !== expectedPoints.length) {
    throw new Error("USGS 3DEP returned incomplete elevation coverage.");
  }
  return expectedPoints.map((_, index) => byLocation.get(index)!);
}

export function deriveTerrainSegment(
  start: TerrainElevationSample,
  end: TerrainElevationSample,
): TerrainSegment {
  const horizontalDistanceMeters = distanceMeters(start, end);
  if (horizontalDistanceMeters < 0.1) {
    throw new Error("Terrain segment points must be spatially distinct.");
  }
  const elevationChangeMeters = end.elevationMeters - start.elevationMeters;
  const grade = elevationChangeMeters / horizontalDistanceMeters;
  return {
    horizontalDistanceMeters,
    elevationChangeMeters,
    grade,
    slopeDegrees: (Math.atan(Math.abs(grade)) * 180) / Math.PI,
  };
}

function assertCoordinate(point: Coordinate) {
  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    point.latitude < -90 ||
    point.latitude > 90 ||
    point.longitude < -180 ||
    point.longitude > 180
  ) {
    throw new Error("Invalid USGS 3DEP sample coordinate.");
  }
}

function distanceMeters(start: Coordinate, end: Coordinate) {
  const earthRadiusMeters = 6_371_008.8;
  const toRadians = Math.PI / 180;
  const latitudeDelta = (end.latitude - start.latitude) * toRadians;
  const longitudeDelta = (end.longitude - start.longitude) * toRadians;
  const startLatitude = start.latitude * toRadians;
  const endLatitude = end.latitude * toRadians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${name}.`);
  }
  return value as Record<string, unknown>;
}
