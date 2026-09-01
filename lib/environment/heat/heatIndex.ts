import { clamp01 } from "@/lib/comfort/thermal";

export function celsiusToFahrenheit(value: number) {
  return (value * 9) / 5 + 32;
}

export function fahrenheitToCelsius(value: number) {
  return ((value - 32) * 5) / 9;
}

export function calculateNwsHeatIndexC({
  temperatureC,
  relativeHumidity,
}: {
  temperatureC?: number | null;
  relativeHumidity?: number | null;
}) {
  if (
    typeof temperatureC !== "number" ||
    !Number.isFinite(temperatureC) ||
    typeof relativeHumidity !== "number" ||
    !Number.isFinite(relativeHumidity)
  ) {
    return null;
  }

  const temperatureF = celsiusToFahrenheit(temperatureC);
  const humidity = clamp01(relativeHumidity / 100) * 100;
  if (temperatureF < 80) return null;

  const simple =
    0.5 * (temperatureF + 61 + (temperatureF - 68) * 1.2 + humidity * 0.094);
  const simpleAverage = (simple + temperatureF) / 2;
  if (simpleAverage < 80) return fahrenheitToCelsius(simpleAverage);

  let heatIndexF =
    -42.379 +
    2.04901523 * temperatureF +
    10.14333127 * humidity -
    0.22475541 * temperatureF * humidity -
    0.00683783 * temperatureF * temperatureF -
    0.05481717 * humidity * humidity +
    0.00122874 * temperatureF * temperatureF * humidity +
    0.00085282 * temperatureF * humidity * humidity -
    0.00000199 * temperatureF * temperatureF * humidity * humidity;

  if (humidity < 13 && temperatureF >= 80 && temperatureF <= 112) {
    heatIndexF -=
      ((13 - humidity) / 4) * Math.sqrt((17 - Math.abs(temperatureF - 95)) / 17);
  } else if (humidity > 85 && temperatureF >= 80 && temperatureF <= 87) {
    heatIndexF += ((humidity - 85) / 10) * ((87 - temperatureF) / 5);
  }

  return fahrenheitToCelsius(heatIndexF);
}

export function selectEffectiveHeatTemperatureC({
  temperatureC,
  apparentTemperatureC,
  relativeHumidity,
}: {
  temperatureC?: number | null;
  apparentTemperatureC?: number | null;
  relativeHumidity?: number | null;
}) {
  const ambient =
    typeof temperatureC === "number" && Number.isFinite(temperatureC) ? temperatureC : null;
  const apparent =
    typeof apparentTemperatureC === "number" && Number.isFinite(apparentTemperatureC)
      ? apparentTemperatureC
      : null;
  const heatIndexC = calculateNwsHeatIndexC({ temperatureC: ambient, relativeHumidity });

  if (ambient === null) {
    return {
      effectiveHeatTemperatureC: apparent ?? heatIndexC,
      heatIndexC,
      source: apparent !== null ? "apparent" : heatIndexC !== null ? "heat-index" : "missing",
    } as const;
  }

  if (apparent !== null && ambient >= 26 && apparent >= ambient - 2) {
    return { effectiveHeatTemperatureC: apparent, heatIndexC, source: "apparent" } as const;
  }

  if (heatIndexC !== null) {
    return { effectiveHeatTemperatureC: heatIndexC, heatIndexC, source: "heat-index" } as const;
  }

  return { effectiveHeatTemperatureC: ambient, heatIndexC, source: "ambient" } as const;
}
