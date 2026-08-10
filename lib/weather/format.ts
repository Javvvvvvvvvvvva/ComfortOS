import { celsiusToFahrenheit, degreesToCardinal, mpsToMph } from "./units";

export function formatTemperatureF(value: number | null | undefined) {
  const fahrenheit = celsiusToFahrenheit(value);
  return fahrenheit === null ? undefined : `${Math.round(fahrenheit)}°F`;
}

export function formatWindMph(
  speedMps: number | null | undefined,
  directionDeg?: number | null,
) {
  const mph = mpsToMph(speedMps);
  if (mph === null) return undefined;

  const direction = degreesToCardinal(directionDeg);
  return `${direction ? `${direction} ` : ""}${Math.round(mph)} mph`;
}
