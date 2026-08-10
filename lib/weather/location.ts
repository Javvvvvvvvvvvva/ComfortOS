import { MINNEAPOLIS_CENTER, type Coordinate } from "@/lib/geo/types";

export function selectWeatherCoordinate({
  selectedOrigin,
  currentLocation,
  fallback = MINNEAPOLIS_CENTER,
}: {
  selectedOrigin?: Coordinate | null;
  currentLocation?: Coordinate | null;
  fallback?: Coordinate;
}) {
  return selectedOrigin ?? currentLocation ?? fallback;
}
