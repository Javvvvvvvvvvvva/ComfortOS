import type { WeatherBundle } from "@/lib/weather/types";
import { calculateEstimatedPedestrianWindChill } from "@/lib/comfort/thermal";
import { selectEffectiveHeatTemperatureC } from "@/lib/environment/heat/heatIndex";
import { selectComfortWeatherForTime } from "@/lib/comfort/context";
import {
  isFrozenPrecipitation,
  type PrecipitationType,
} from "@/lib/weather/precipitation";

export type RoutingContext = "cold" | "balanced" | "rain" | "snow" | "heat";

export type RoutingContextDecision = {
  context: RoutingContext;
  routeLabel: "Stay Warm" | "Comfort" | "Stay Dry" | "Snow Comfort" | "Stay Cool";
  reason: string;
  confidence: number;
  rainSeverity: number;
  snowSeverity: number;
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
  meaningfulSnowMmPerHour: 0.25,
  heavySnowMmPerHour: 12.5,
  meaningfulIceMmPerHour: 0.01,
  significantIceMmPerHour: 0.25,
  severeColdTemperatureC: -4,
  heatTemperatureC: 32,
  heatApparentTemperatureC: 35,
  extremeHeatC: 43,
};

export function decideRoutingContext(
  weather: WeatherBundle | null,
  options: {
    rainCapable?: boolean;
    snowCapable?: boolean;
    heatCapable?: boolean;
    atTime?: string;
  } = {},
): RoutingContextDecision {
  const current = selectComfortWeatherForTime(
    weather,
    options.atTime ?? weather?.updatedAt ?? new Date().toISOString(),
  );
  if (current.selectionMethod === "missing") {
    return {
      context: "balanced",
      routeLabel: "Comfort",
      reason: "Live conditions are unavailable.",
      confidence: 0,
      rainSeverity: 0,
      snowSeverity: 0,
      coldSeverity: 0,
      heatSeverity: 0,
    };
  }

  const temperatureC = current.temperatureC;
  const windSpeedMps = current.regionalWindSpeedMps;
  const currentWindChillC = firstNumber(
    current.windChillC,
    calculateEstimatedPedestrianWindChill({
      temperatureC,
      pedestrianWindExposureMps: windSpeedMps,
    }).windChillC,
  );
  const coldAmbient =
    temperatureC !== undefined &&
    temperatureC !== null &&
    temperatureC <= ROUTING_CONTEXT_THRESHOLDS.coldTemperatureC;
  const coldApparent =
    currentWindChillC !== null &&
    currentWindChillC <= ROUTING_CONTEXT_THRESHOLDS.coldApparentTemperatureC;
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
    condition: current.condition,
    precipitationType: current.precipitationType,
  });
  const snowSeverity = snowSeverityFromWeather({
    snowfallMmPerHour: current.snowfallMmPerHour,
    iceAccumulationMmPerHour: current.iceAccumulationMmPerHour,
    precipitationProbability,
    precipitationType: current.precipitationType,
  });
  const coldSeverity = coldSeverityFromWeather({
    temperatureC,
    windChillC: currentWindChillC,
    windSpeedMps,
  });
  const heatSeverity = heatSeverityFromWeather({
    temperatureC,
    heatIndexC: current.heatIndexC,
    relativeHumidity: current.relativeHumidity,
    condition: current.condition,
  });
  const rainCapable = options.rainCapable ?? true;
  const snowCapable = options.snowCapable ?? true;
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
      snowSeverity,
      coldSeverity,
      heatSeverity,
    };
  }

  if (
    snowCapable &&
    snowSeverity > 0 &&
    snowSeverity >= rainSeverity &&
    snowSeverity >= heatSeverity * 0.95
  ) {
    return {
      context: "snow",
      routeLabel: "Snow Comfort",
      reason: "Snow or ice exposure is relevant now.",
      confidence,
      rainSeverity,
      snowSeverity,
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
      snowSeverity,
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
      snowSeverity,
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
        : snowSeverity > 0 && !snowCapable
          ? "Snow or ice detected, but winter-route data is limited here."
        : heatSeverity > 0 && !heatCapable
          ? "Heat detected, but shade and heat coverage are limited here."
        : "Mild conditions.",
    confidence,
    rainSeverity,
    snowSeverity,
    coldSeverity,
    heatSeverity,
  };
}

export function rainSeverityFromWeather({
  precipitationIntensityMmPerHour,
  precipitationProbability,
  condition,
  precipitationType,
}: {
  precipitationIntensityMmPerHour?: number | null;
  precipitationProbability?: number | null;
  condition?: string | null;
  precipitationType?: PrecipitationType | null;
}) {
  if (isFrozenPrecipitation(precipitationType)) return 0;
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

export function snowSeverityFromWeather({
  snowfallMmPerHour,
  iceAccumulationMmPerHour,
  precipitationProbability,
  precipitationType,
}: {
  snowfallMmPerHour?: number | null;
  iceAccumulationMmPerHour?: number | null;
  precipitationProbability?: number | null;
  precipitationType?: PrecipitationType | null;
}) {
  const snowfall = finiteNonNegative(snowfallMmPerHour);
  const ice = finiteNonNegative(iceAccumulationMmPerHour);
  const probability = finiteNonNegative(precipitationProbability);
  const snowfallSeverity =
    snowfall !== null && snowfall >= ROUTING_CONTEXT_THRESHOLDS.meaningfulSnowMmPerHour
      ? Math.min(1, snowfall / ROUTING_CONTEXT_THRESHOLDS.heavySnowMmPerHour)
      : 0;
  const iceSeverity =
    ice !== null && ice >= ROUTING_CONTEXT_THRESHOLDS.meaningfulIceMmPerHour
      ? Math.min(
          1,
          0.4 +
            0.6 *
              (ice / ROUTING_CONTEXT_THRESHOLDS.significantIceMmPerHour),
        )
      : 0;
  const typeSeverity =
    isFrozenPrecipitation(precipitationType) &&
    probability !== null &&
    probability >= ROUTING_CONTEXT_THRESHOLDS.rainProbabilityThreshold
      ? precipitationType === "freezing-rain" || precipitationType === "mixed"
        ? 0.55
        : precipitationType === "sleet"
          ? 0.45
          : 0.32
      : 0;
  return Math.max(snowfallSeverity, iceSeverity, typeSeverity);
}

function coldSeverityFromWeather({
  temperatureC,
  windChillC,
  windSpeedMps,
}: {
  temperatureC?: number | null;
  windChillC?: number | null;
  windSpeedMps?: number | null;
}) {
  const calculatedWindChill = calculateEstimatedPedestrianWindChill({
    temperatureC,
    pedestrianWindExposureMps: windSpeedMps,
  }).windChillC;
  const effectiveTemperature = firstNumber(windChillC, calculatedWindChill, temperatureC);
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
  heatIndexC,
  relativeHumidity,
  condition,
}: {
  temperatureC?: number | null;
  heatIndexC?: number | null;
  relativeHumidity?: number | null;
  condition?: string | null;
}) {
  const heatTemperature = selectEffectiveHeatTemperatureC({
    temperatureC,
    heatIndexC,
    relativeHumidity,
  });
  const effectiveTemperature = heatTemperature.effectiveHeatTemperatureC;
  if (effectiveTemperature === null) return 0;
  const heatStart = ROUTING_CONTEXT_THRESHOLDS.heatTemperatureC;
  const severe = ROUTING_CONTEXT_THRESHOLDS.extremeHeatC;
  const apparentStart = ROUTING_CONTEXT_THRESHOLDS.heatApparentTemperatureC;
  const effectiveStart = heatTemperature.heatIndexC !== null
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

function finiteNonNegative(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : null;
}
