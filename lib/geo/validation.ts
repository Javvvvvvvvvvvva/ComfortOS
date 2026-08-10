import type { Coordinate, LineStringGeometry } from "./types";

export function isValidCoordinate(value: Coordinate): boolean {
  return (
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
}

export function assertValidCoordinate(value: Coordinate, label: string): void {
  if (!isValidCoordinate(value)) {
    throw new Error(`${label} must be a valid latitude/longitude coordinate.`);
  }
}

export function isLineStringGeometry(value: unknown): value is LineStringGeometry {
  if (!value || typeof value !== "object") return false;

  const maybeGeometry = value as Partial<LineStringGeometry>;
  return (
    maybeGeometry.type === "LineString" &&
    Array.isArray(maybeGeometry.coordinates) &&
    maybeGeometry.coordinates.length >= 2 &&
    maybeGeometry.coordinates.every(
      (coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length === 2 &&
        Number.isFinite(coordinate[0]) &&
        Number.isFinite(coordinate[1]),
    )
  );
}
