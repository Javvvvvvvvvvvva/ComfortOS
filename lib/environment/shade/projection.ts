import type { Coordinate } from "@/lib/geo/types";

const EARTH_RADIUS_METERS = 6371008.8;

export type ProjectedPoint = [number, number];

export type LocalProjection = {
  project(coordinate: Coordinate): ProjectedPoint;
  unproject(point: ProjectedPoint): Coordinate;
};

export function createLocalProjection(origin: Coordinate): LocalProjection {
  const originLatRad = degreesToRadians(origin.latitude);
  const originLonRad = degreesToRadians(origin.longitude);
  const cosOriginLat = Math.cos(originLatRad);

  return {
    project(coordinate) {
      return [
        (degreesToRadians(coordinate.longitude) - originLonRad) *
          EARTH_RADIUS_METERS *
          cosOriginLat,
        (degreesToRadians(coordinate.latitude) - originLatRad) * EARTH_RADIUS_METERS,
      ];
    },
    unproject(point) {
      return {
        latitude: radiansToDegrees(point[1] / EARTH_RADIUS_METERS + originLatRad),
        longitude: radiansToDegrees(
          point[0] / (EARTH_RADIUS_METERS * cosOriginLat) + originLonRad,
        ),
      };
    },
  };
}

export function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}
