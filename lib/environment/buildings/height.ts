import type { HeightSource } from "@/lib/environment/buildings/types";

export const DEFAULT_FLOOR_HEIGHT_METERS = 3;

export type NormalizedHeight = {
  heightMeters: number | null;
  minHeightMeters: number | null;
  floors: number | null;
  heightSource: HeightSource;
  confidence: number;
};

export function normalizeBuildingHeight({
  height,
  minHeight,
  floors,
  sourceConfidence = 0.8,
}: {
  height?: unknown;
  minHeight?: unknown;
  floors?: unknown;
  sourceConfidence?: number;
}): NormalizedHeight {
  const heightMeters = parseMeters(height);
  const minHeightMeters = parseMeters(minHeight);
  const floorCount = parsePositiveNumber(floors);

  if (heightMeters !== null) {
    return {
      heightMeters,
      minHeightMeters,
      floors: floorCount,
      heightSource: "provider",
      confidence: sourceConfidence,
    };
  }

  if (floorCount !== null) {
    return {
      heightMeters: floorCount * DEFAULT_FLOOR_HEIGHT_METERS,
      minHeightMeters,
      floors: floorCount,
      heightSource: "floors-derived",
      confidence: Math.min(sourceConfidence, 0.55),
    };
  }

  return {
    heightMeters: null,
    minHeightMeters,
    floors: null,
    heightSource: "unknown",
    confidence: 0.25,
  };
}

export function parseMeters(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(",", ".");
  const match = normalized.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const numericValue = Number(match[1]);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;

  if (normalized.includes("ft") || normalized.includes("feet")) {
    return numericValue * 0.3048;
  }

  return numericValue;
}

function parsePositiveNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string") return null;
  const numericValue = Number(value.trim().replace(",", "."));
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}
