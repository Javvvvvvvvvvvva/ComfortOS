import type { SegmentComfortWeather } from "@/lib/comfort/types";
import type { WeatherBundle, WeatherForecastPoint } from "@/lib/weather/types";

export function selectComfortWeatherForTime(
  weatherBundle: WeatherBundle | null | undefined,
  timestamp: string,
): SegmentComfortWeather {
  if (!weatherBundle) {
    return { confidence: 0, selectionMethod: "missing" };
  }

  const targetTime = new Date(timestamp).valueOf();
  if (Number.isNaN(targetTime)) {
    return { confidence: 0, selectionMethod: "missing" };
  }

  const forecastPoints = weatherBundle.hourlyForecast
    .filter(hasComfortWeather)
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
          temperatureC: interpolateNullable(before.temperatureC, after.temperatureC, ratio),
          apparentTemperatureC: interpolateNullable(
            before.apparentTemperatureC,
            after.apparentTemperatureC,
            ratio,
          ),
          relativeHumidity: interpolateNullable(
            before.relativeHumidity,
            after.relativeHumidity,
            ratio,
          ),
          regionalWindSpeedMps: interpolateNullable(
            before.windSpeedMps,
            after.windSpeedMps,
            ratio,
          ),
          precipitationProbability: interpolateNullable(
            before.precipitationProbability,
            after.precipitationProbability,
            ratio,
          ),
          precipitationMmPerHour: interpolateNullable(
            before.precipitationMmPerHour,
            after.precipitationMmPerHour,
            ratio,
          ),
          condition: before.shortCondition ?? after.shortCondition ?? null,
          confidence: 0.7,
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
      temperatureC: nearestForecast.temperatureC,
      apparentTemperatureC: nearestForecast.apparentTemperatureC,
      relativeHumidity: nearestForecast.relativeHumidity,
      regionalWindSpeedMps: nearestForecast.windSpeedMps,
      regionalWindDirectionDeg: nearestForecast.windDirectionDeg,
      precipitationProbability: nearestForecast.precipitationProbability,
      precipitationMmPerHour: nearestForecast.precipitationMmPerHour,
      condition: nearestForecast.shortCondition ?? null,
      confidence: 0.62,
      selectionMethod: "nearest-hour",
    };
  }

  if (weatherBundle.current) {
    return {
      temperatureC: weatherBundle.current.temperatureC,
      apparentTemperatureC: weatherBundle.current.apparentTemperatureC,
      relativeHumidity: weatherBundle.current.relativeHumidity,
      regionalWindSpeedMps: weatherBundle.current.windSpeedMps,
      regionalWindDirectionDeg: weatherBundle.current.windDirectionDeg,
      precipitationProbability: weatherBundle.current.precipitationProbability,
      precipitationMmPerHour: weatherBundle.current.precipitationMmPerHour,
      condition: weatherBundle.current.shortCondition ?? null,
      confidence: weatherBundle.current.confidence ?? 0.6,
      selectionMethod: "current",
    };
  }

  return { confidence: 0, selectionMethod: "missing" };
}

function hasComfortWeather(point: WeatherForecastPoint) {
  return (
    (point.temperatureC !== null && point.temperatureC !== undefined) ||
    (point.apparentTemperatureC !== null && point.apparentTemperatureC !== undefined) ||
    (point.windSpeedMps !== null && point.windSpeedMps !== undefined) ||
    (point.precipitationProbability !== null &&
      point.precipitationProbability !== undefined) ||
    (point.precipitationMmPerHour !== null &&
      point.precipitationMmPerHour !== undefined)
  );
}

function interpolateNullable(
  left: number | null | undefined,
  right: number | null | undefined,
  ratio: number,
) {
  if (typeof left === "number" && Number.isFinite(left) && typeof right === "number" && Number.isFinite(right)) {
    return left + (right - left) * ratio;
  }
  if (typeof left === "number" && Number.isFinite(left)) return left;
  if (typeof right === "number" && Number.isFinite(right)) return right;
  return null;
}
