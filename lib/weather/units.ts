export function fahrenheitToCelsius(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? ((value - 32) * 5) / 9
    : null;
}

export function celsiusToFahrenheit(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? (value * 9) / 5 + 32
    : null;
}

export function kmhToMps(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value / 3.6 : null;
}

export function mphToMps(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value * 0.44704
    : null;
}

export function mpsToMph(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value / 0.44704
    : null;
}

export function parseSpeedToMps(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;

  const matches = value.match(/-?\d+(?:\.\d+)?/g);
  if (!matches?.length) return null;

  const average =
    matches.map(Number).reduce((sum, number) => sum + number, 0) / matches.length;
  const lower = value.toLowerCase();

  if (lower.includes("mph")) return mphToMps(average);
  if (lower.includes("km/h") || lower.includes("kph")) return kmhToMps(average);
  return average;
}

export function directionToDegrees(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();
  const cardinals: Record<string, number> = {
    N: 0,
    NNE: 22.5,
    NE: 45,
    ENE: 67.5,
    E: 90,
    ESE: 112.5,
    SE: 135,
    SSE: 157.5,
    S: 180,
    SSW: 202.5,
    SW: 225,
    WSW: 247.5,
    W: 270,
    WNW: 292.5,
    NW: 315,
    NNW: 337.5,
  };

  return cardinals[normalized] ?? null;
}

export function degreesToCardinal(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const index = Math.round((((value % 360) + 360) % 360) / 22.5) % 16;
  return directions[index];
}
