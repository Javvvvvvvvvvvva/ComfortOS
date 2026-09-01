import type { WeatherBundle } from "@/lib/weather/types";

export type RoutingContext = "cold" | "balanced" | "rain" | "heat";

export type RoutingContextDecision = {
  context: RoutingContext;
  routeLabel: "Stay Warm" | "Comfort" | "Stay Dry" | "Stay Cool";
  reason: string;
  confidence: number;
  rainSeverity: number;
  coldSeverity: number;
  heatSeverity: number;
};

export const ROUTING_CONTEXT_THRESHOLDS = {
  coldTemperatureC: 4,
  coldApparentTemperatureC: 2,
  windyMps: 4.5,
  coldWindTemperatureC: 10,
  meaningfulRainMmPerHour: 0.25,
  rainProbabilityThreshold: 55,
  heavyRainMmPerHour: 4,
  severeColdTemperatureC: -4,
  heatTemperatureC: 32,
  heatApparentTemperatureC: 35,
  extremeHeatC: 43,
};

export function decideRoutingContext(
  weather: WeatherBundle | null,
  options: { rainCapable?: boolean; heatCapable?: boolean } = {},
): RoutingContextDecision {
  const current = weather?.current ?? weather?.hourlyForecast[0] ?? null;
  if (!current) {
    return {
      context: "balanced",
      routeLabel: "Comfort",
      reason: "Live conditions are unavailable.",
      confidence: 0,
      rainSeverity: 0,
      coldSeverity: 0,
      heatSeverity: 0,
    };
  }

  const temperatureC = current.temperatureC;
  const apparentTemperatureC = current.apparentTemperatureC;
  const windSpeedMps = current.windSpeedMps;
  const coldAmbient =
    temperatureC !== undefined &&
    temperatureC !== null &&
    temperatureC <= ROUTING_CONTEXT_THRESHOLDS.coldTemperatureC;
  const coldApparent =
    apparentTemperatureC !== undefined &&
    apparentTemperatureC !== null &&
    apparentTemperatureC <= ROUTING_CONTEXT_THRESHOLDS.coldApparentTemperatureC;
  const coldAndWindy =
    temperatureC !== undefined &&
    temperatureC !== null &&
    windSpeedMps !== undefined &&
    windSpeedMps !== null &&
    temperatureC <= ROUTING_CONTEXT_THRESHOLDS.coldWindTemperatureC &&
    windSpeedMps >= ROUTING_CONTEXT_THRESHOLDS.windyMps;
  const confidence =
    "confidence" in current && typeof current.confidence === "number"
      ? current.confidence
      : 0.7;
  const precipitationIntensityMmPerHour = current.precipitationMmPerHour;
  const precipitationProbability = current.precipitationProbability;
  const rainSeverity = rainSeverityFromWeather({
    precipitationIntensityMmPerHour,
    precipitationProbability,
    condition: current.shortCondition,
  });
  const coldSeverity = coldSeverityFromWeather({
    temperatureC,
    apparentTemperatureC,
    windSpeedMps,
  });
  const heatSeverity = heatSeverityFromWeather({
    temperatureC,
    apparentTemperatureC,
    condition: current.shortCondition,
  });
  const rainCapable = options.rainCapable ?? true;
  const heatCapable = options.heatCapable ?? true;

  if (
    heatCapable &&
    heatSeverity > 0 &&
    heatSeverity >= rainSeverity * 1.1 &&
    heatSeverity >= coldSeverity * 1.05
  ) {
    return {
      context: "heat",
      routeLabel: "Stay Cool",
      reason: "High heat and sun exposure are relevant now.",
      confidence,
      rainSeverity,
      coldSeverity,
      heatSeverity,
    };
  }

  if (
    rainCapable &&
    rainSeverity > 0 &&
    rainSeverity >= coldSeverity * 1.15 &&
    rainSeverity >= heatSeverity * 0.95
  ) {
    return {
      context: "rain",
      routeLabel: "Stay Dry",
      reason: "Rain exposure is relevant now.",
      confidence,
      rainSeverity,
      coldSeverity,
      heatSeverity,
    };
  }

  if (coldAmbient || coldApparent || coldAndWindy || coldSeverity > 0.35) {
    return {
      context: "cold",
      routeLabel: "Stay Warm",
      reason: coldAndWindy ? "Cold and windy conditions." : "Cold conditions.",
      confidence,
      rainSeverity,
      coldSeverity,
      heatSeverity,
    };
  }

  return {
    context: "balanced",
    routeLabel: "Comfort",
    reason:
      rainSeverity > 0 && !rainCapable
        ? "Rain detected, but environmental coverage is limited here."
        : heatSeverity > 0 && !heatCapable
          ? "Heat detected, but shade and heat coverage are limited here."
        : "Mild conditions.",
    confidence,
    rainSeverity,
    coldSeverity,
    heatSeverity,
  };
}

export function rainSeverityFromWeather({
  precipitationIntensityMmPerHour,
  precipitationProbability,
  condition,
}: {
  precipitationIntensityMmPerHour?: number | null;
  precipitationProbability?: number | null;
  condition?: string | null;
}) {
  const intensity =
    typeof precipitationIntensityMmPerHour === "number" &&
    Number.isFinite(precipitationIntensityMmPerHour)
      ? Math.max(0, precipitationIntensityMmPerHour)
      : null;
  if (intensity !== null) {
    if (intensity <= 0) return 0;
    return Math.min(1, intensity / ROUTING_CONTEXT_THRESHOLDS.heavyRainMmPerHour);
  }

  const rainyCondition = condition ? /\brain|showers|drizzle\b/i.test(condition) : false;
  const probability =
    typeof precipitationProbability === "number" && Number.isFinite(precipitationProbability)
      ? precipitationProbability
      : null;
  if (rainyCondition && probability !== null && probability >= ROUTING_CONTEXT_THRESHOLDS.rainProbabilityThreshold) {
    return 0.32;
  }
  return 0;
}

function coldSeverityFromWeather({
  temperatureC,
  apparentTemperatureC,
  windSpeedMps,
}: {
  temperatureC?: number | null;
  apparentTemperatureC?: number | null;
  windSpeedMps?: number | null;
}) {
  const effectiveTemperature = firstNumber(apparentTemperatureC, temperatureC);
  if (effectiveTemperature === null) return 0;
  const ambientSeverity =
    effectiveTemperature <= ROUTING_CONTEXT_THRESHOLDS.coldTemperatureC
      ? Math.min(
          1,
          (ROUTING_CONTEXT_THRESHOLDS.coldTemperatureC - effectiveTemperature) /
            (ROUTING_CONTEXT_THRESHOLDS.coldTemperatureC -
              ROUTING_CONTEXT_THRESHOLDS.severeColdTemperatureC),
        )
      : 0;
  const windyBoost =
    typeof windSpeedMps === "number" &&
    windSpeedMps >= ROUTING_CONTEXT_THRESHOLDS.windyMps &&
    effectiveTemperature <= ROUTING_CONTEXT_THRESHOLDS.coldWindTemperatureC
      ? 0.24
      : 0;
  return Math.min(1, ambientSeverity + windyBoost);
}

export function heatSeverityFromWeather({
  temperatureC,
  apparentTemperatureC,
  condition,
}: {
  temperatureC?: number | null;
  apparentTemperatureC?: number | null;
  condition?: string | null;
}) {
  const effectiveTemperature = firstNumber(apparentTemperatureC, temperatureC);
  if (effectiveTemperature === null) return 0;
  const heatStart = ROUTING_CONTEXT_THRESHOLDS.heatTemperatureC;
  const severe = ROUTING_CONTEXT_THRESHOLDS.extremeHeatC;
  const apparentStart = ROUTING_CONTEXT_THRESHOLDS.heatApparentTemperatureC;
  const effectiveStart = apparentTemperatureC !== null && apparentTemperatureC !== undefined
    ? apparentStart
    : heatStart;
  const base =
    effectiveTemperature >= effectiveStart
      ? Math.min(1, (effectiveTemperature - effectiveStart) / (severe - effectiveStart))
      : 0;
  const sunnyBoost =
    condition && /\bsun|clear|hot\b/i.test(condition) && effectiveTemperature >= heatStart
      ? 0.12
      : 0;
  return Math.min(1, base + sunnyBoost);
}

function firstNumber(...values: Array<number | null | undefined>) {
  return values.find((value) => typeof value === "number" && Number.isFinite(value)) ?? null;
}
