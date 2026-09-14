import type { Coordinate } from "@/lib/geo/types";

const EARTH_RADIUS_METERS = 6_371_008.8;
export const WEATHER_BUNDLE_COORDINATE_TOLERANCE_METERS = 250;

export function selectWeatherCoordinate({
  selectedOrigin,
  currentLocation,
}: {
  selectedOrigin?: Coordinate | null;
  currentLocation?: Coordinate | null;
}) {
  return selectedOrigin ?? currentLocation ?? null;
}

export function coordinateDistanceMeters(left: Coordinate, right: Coordinate) {
  const leftLatitude = degreesToRadians(left.latitude);
  const rightLatitude = degreesToRadians(right.latitude);
  const latitudeDelta = rightLatitude - leftLatitude;
  const longitudeDelta = degreesToRadians(right.longitude - left.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function weatherBundleMatchesCoordinate(
  bundleCoordinate: Coordinate,
  requestedCoordinate: Coordinate,
  toleranceMeters = WEATHER_BUNDLE_COORDINATE_TOLERANCE_METERS,
) {
  return coordinateDistanceMeters(bundleCoordinate, requestedCoordinate) <= toleranceMeters;
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}
