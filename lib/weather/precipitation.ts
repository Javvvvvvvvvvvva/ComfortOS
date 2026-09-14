export type PrecipitationType =
  | "none"
  | "rain"
  | "snow"
  | "sleet"
  | "freezing-rain"
  | "mixed"
  | "unknown";

export function classifyPrecipitationType({
  condition,
  precipitationMmPerHour,
  snowfallMmPerHour,
  iceAccumulationMmPerHour,
}: {
  condition?: string | null;
  precipitationMmPerHour?: number | null;
  snowfallMmPerHour?: number | null;
  iceAccumulationMmPerHour?: number | null;
}): PrecipitationType | null {
  const normalized = (condition ?? "").toLowerCase().replaceAll("_", " ");
  const mentionsFreezingRain = /freezing rain|freezing drizzle/.test(normalized);
  const mentionsSleet = /sleet|ice pellets?|graupel/.test(normalized);
  const mentionsSnow = /snow|flurr(?:y|ies)|blizzard|snow squall/.test(normalized);
  const mentionsRain = /\brain|showers?|drizzle/.test(normalized);
  const hasSnowAmount = positive(snowfallMmPerHour);
  const hasIceAmount = positive(iceAccumulationMmPerHour);

  if ((mentionsSnow || hasSnowAmount) && (mentionsRain || mentionsFreezingRain || hasIceAmount)) {
    return "mixed";
  }
  if (mentionsFreezingRain || hasIceAmount) return "freezing-rain";
  if (mentionsSleet) return "sleet";
  if (mentionsSnow || hasSnowAmount) return "snow";
  if (mentionsRain) return "rain";

  const knownAmounts = [
    precipitationMmPerHour,
    snowfallMmPerHour,
    iceAccumulationMmPerHour,
  ].filter(isFiniteNumber);
  if (knownAmounts.length > 0 && knownAmounts.every((value) => value <= 0)) {
    return "none";
  }
  if (positive(precipitationMmPerHour)) return "unknown";
  return null;
}

export function isFrozenPrecipitation(
  value: PrecipitationType | null | undefined,
) {
  return (
    value === "snow" ||
    value === "sleet" ||
    value === "freezing-rain" ||
    value === "mixed"
  );
}

function positive(value: number | null | undefined) {
  return isFiniteNumber(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
