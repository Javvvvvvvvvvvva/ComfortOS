import type { Coordinate } from "@/lib/geo/types";
import { isValidCoordinate } from "@/lib/geo/validation";

export function requireJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SyntaxError("Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function parseCoordinateBody(value: unknown): Coordinate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.latitude !== "number" ||
    typeof candidate.longitude !== "number"
  ) {
    return null;
  }
  const coordinate = {
    latitude: candidate.latitude,
    longitude: candidate.longitude,
  };
  return isValidCoordinate(coordinate) ? coordinate : null;
}

export function parseOptionalBodyString(value: unknown, maxLength = 512) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : undefined;
}
