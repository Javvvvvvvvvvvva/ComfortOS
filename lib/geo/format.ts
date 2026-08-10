import type { Coordinate } from "./types";

const METERS_PER_MILE = 1609.344;

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) {
    return "Unavailable";
  }

  if (meters < 160) {
    return `${Math.round(meters)} m`;
  }

  const miles = meters / METERS_PER_MILE;
  return `${miles.toFixed(miles >= 10 ? 0 : 1)} mi`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "Unavailable";
  }

  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${hours} hr`
    : `${hours} hr ${remainingMinutes} min`;
}

export function formatCoordinate(coordinate: Coordinate | null): string {
  if (!coordinate) return "Not selected";

  return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}
