export type WindChillResult = {
  windChillC: number | null;
  valid: boolean;
  reason?: "temperature-above-range" | "wind-below-range" | "missing-input";
};

const WIND_CHILL_MAX_TEMPERATURE_C = 10;
const WIND_CHILL_MIN_WIND_KMH = 4.8;

export function calculateEstimatedPedestrianWindChill({
  temperatureC,
  pedestrianWindExposureMps,
}: {
  temperatureC: number | null | undefined;
  pedestrianWindExposureMps: number | null | undefined;
}): WindChillResult {
  if (
    typeof temperatureC !== "number" ||
    !Number.isFinite(temperatureC) ||
    typeof pedestrianWindExposureMps !== "number" ||
    !Number.isFinite(pedestrianWindExposureMps)
  ) {
    return { windChillC: null, valid: false, reason: "missing-input" };
  }

  const windKmh = pedestrianWindExposureMps * 3.6;
  if (temperatureC > WIND_CHILL_MAX_TEMPERATURE_C) {
    return { windChillC: null, valid: false, reason: "temperature-above-range" };
  }
  if (windKmh <= WIND_CHILL_MIN_WIND_KMH) {
    return { windChillC: null, valid: false, reason: "wind-below-range" };
  }

  const windPower = Math.pow(windKmh, 0.16);
  return {
    windChillC:
      13.12 +
      0.6215 * temperatureC -
      11.37 * windPower +
      0.3965 * temperatureC * windPower,
    valid: true,
  };
}

export function coldStressRatio({
  temperatureC,
  neutralTemperatureC,
  severeColdTemperatureC,
}: {
  temperatureC: number | null | undefined;
  neutralTemperatureC: number;
  severeColdTemperatureC: number;
}) {
  if (typeof temperatureC !== "number" || !Number.isFinite(temperatureC)) return null;
  const range = neutralTemperatureC - severeColdTemperatureC;
  if (range <= 0) return 0;
  return clamp01((neutralTemperatureC - temperatureC) / range);
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
