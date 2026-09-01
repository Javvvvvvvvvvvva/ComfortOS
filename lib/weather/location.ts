import type { Coordinate } from "@/lib/geo/types";

export function selectWeatherCoordinate({
  selectedOrigin,
  currentLocation,
}: {
  selectedOrigin?: Coordinate | null;
  currentLocation?: Coordinate | null;
}) {
  return selectedOrigin ?? currentLocation ?? null;
}
