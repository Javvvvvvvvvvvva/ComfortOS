import type { WeatherBundle, WeatherForecastPoint } from "@/lib/weather/types";

export type SegmentRainWeather = {
  precipitationIntensityMmPerHour?: number | null;
  precipitationProbability?: number | null;
  regionalWindSpeedMps?: number | null;
  regionalWindDirectionDeg?: number | null;
  condition?: string | null;
  confidence: number;
  selectionMethod: "interpolated-hourly" | "nearest-hour" | "current" | "missing";
};

export function selectRainWeatherForTime(
  weatherBundle: WeatherBundle | null | undefined,
  timestamp: string,
): SegmentRainWeather {
  if (!weatherBundle) return { confidence: 0, selectionMethod: "missing" };
  const targetTime = Date.parse(timestamp);
  if (Number.isNaN(targetTime)) return { confidence: 0, selectionMethod: "missing" };

  const forecastPoints = weatherBundle.hourlyForecast
    .filter(hasRainWeather)
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));

  if (forecastPoints.length >= 2) {
    for (let index = 0; index < forecastPoints.length - 1; index += 1) {
      const before = forecastPoints[index];
      const after = forecastPoints[index + 1];
      const beforeTime = Date.parse(before.timestamp);
      const afterTime = Date.parse(after.timestamp);
      if (targetTime >= beforeTime && targetTime <= afterTime && afterTime > beforeTime) {
        const ratio = (targetTime - beforeTime) / (afterTime - beforeTime);
        return {
          precipitationIntensityMmPerHour: interpolateNullable(
            before.precipitationMmPerHour,
            after.precipitationMmPerHour,
            ratio,
          ),
          precipitationProbability: interpolateNullable(
            before.precipitationProbability,
            after.precipitationProbability,
            ratio,
          ),
          regionalWindSpeedMps: interpolateNullable(
            before.windSpeedMps,
            after.windSpeedMps,
            ratio,
          ),
          regionalWindDirectionDeg: interpolateDirection(
            before.windDirectionDeg,
            after.windDirectionDeg,
            ratio,
          ),
          condition: before.shortCondition ?? after.shortCondition ?? null,
          confidence: 0.72,
          selectionMethod: "interpolated-hourly",
        };
      }
    }
  }

  const nearestForecast = forecastPoints
    .map((point) => ({
      point,
      distanceMs: Math.abs(Date.parse(point.timestamp) - targetTime),
    }))
    .sort((left, right) => left.distanceMs - right.distanceMs)[0]?.point;

  if (nearestForecast) {
    return {
      precipitationIntensityMmPerHour: nearestForecast.precipitationMmPerHour,
      precipitationProbability: nearestForecast.precipitationProbability,
      regionalWindSpeedMps: nearestForecast.windSpeedMps,
      regionalWindDirectionDeg: nearestForecast.windDirectionDeg,
      condition: nearestForecast.shortCondition ?? null,
      confidence: 0.64,
      selectionMethod: "nearest-hour",
    };
  }

  if (weatherBundle.current) {
    return {
      precipitationIntensityMmPerHour: weatherBundle.current.precipitationMmPerHour,
      precipitationProbability: weatherBundle.current.precipitationProbability,
      regionalWindSpeedMps: weatherBundle.current.windSpeedMps,
      regionalWindDirectionDeg: weatherBundle.current.windDirectionDeg,
      condition: weatherBundle.current.shortCondition ?? null,
      confidence: weatherBundle.current.confidence ?? 0.62,
      selectionMethod: "current",
    };
  }

  return { confidence: 0, selectionMethod: "missing" };
}

function hasRainWeather(point: WeatherForecastPoint) {
  return (
    point.precipitationMmPerHour !== null ||
    point.precipitationProbability !== null ||
    point.windSpeedMps !== null ||
    point.windDirectionDeg !== null
  );
}

function interpolateNullable(
  left: number | null | undefined,
  right: number | null | undefined,
  ratio: number,
) {
  if (
    typeof left === "number" &&
    Number.isFinite(left) &&
    typeof right === "number" &&
    Number.isFinite(right)
  ) {
    return left + (right - left) * ratio;
  }
  if (typeof left === "number" && Number.isFinite(left)) return left;
  if (typeof right === "number" && Number.isFinite(right)) return right;
  return null;
}

function interpolateDirection(
  left: number | null | undefined,
  right: number | null | undefined,
  ratio: number,
) {
  if (
    typeof left === "number" &&
    Number.isFinite(left) &&
    typeof right === "number" &&
    Number.isFinite(right)
  ) {
    const delta = ((((right - left) % 360) + 540) % 360) - 180;
    return ((left + delta * ratio) % 360 + 360) % 360;
  }
  if (typeof left === "number" && Number.isFinite(left)) return left;
  if (typeof right === "number" && Number.isFinite(right)) return right;
  return null;
}
