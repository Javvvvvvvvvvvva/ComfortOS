import type { SegmentComfortWeather } from "@/lib/comfort/types";
import type { WeatherBundle, WeatherForecastPoint } from "@/lib/weather/types";

const CURRENT_OBSERVATION_MAX_AGE_MS = 45 * 60 * 1000;
const CURRENT_OBSERVATION_FUTURE_TOLERANCE_MS = 10 * 60 * 1000;
const NEAREST_FORECAST_MAX_DISTANCE_MS = 90 * 60 * 1000;

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
  const forecastWeather = selectForecastWeather(forecastPoints, targetTime);
  const current = weatherBundle.current;
  const currentTime = current ? Date.parse(current.timestamp) : Number.NaN;
  const currentDistanceMs = targetTime - currentTime;

  if (
    current &&
    Number.isFinite(currentTime) &&
    currentDistanceMs >= -CURRENT_OBSERVATION_FUTURE_TOLERANCE_MS &&
    currentDistanceMs <= CURRENT_OBSERVATION_MAX_AGE_MS
  ) {
    return {
      temperatureC: preferNumber(current.temperatureC, forecastWeather?.temperatureC),
      apparentTemperatureC: preferNumber(
        current.apparentTemperatureC,
        forecastWeather?.apparentTemperatureC,
      ),
      heatIndexC: preferNumber(current.heatIndexC, forecastWeather?.heatIndexC),
      windChillC: preferNumber(current.windChillC, forecastWeather?.windChillC),
      dewPointC: preferNumber(current.dewPointC, forecastWeather?.dewPointC),
      relativeHumidity: preferNumber(
        current.relativeHumidity,
        forecastWeather?.relativeHumidity,
      ),
      cloudCover: preferNumber(current.cloudCover, forecastWeather?.cloudCover),
      regionalWindSpeedMps: preferNumber(
        current.windSpeedMps,
        forecastWeather?.regionalWindSpeedMps,
      ),
      regionalWindDirectionDeg: preferNumber(
        current.windDirectionDeg,
        forecastWeather?.regionalWindDirectionDeg,
      ),
      precipitationProbability: preferNumber(
        current.precipitationProbability,
        forecastWeather?.precipitationProbability,
      ),
      precipitationMmPerHour: preferNumber(
        current.precipitationMmPerHour,
        forecastWeather?.precipitationMmPerHour,
      ),
      snowfallMmPerHour: preferNumber(
        current.snowfallMmPerHour,
        forecastWeather?.snowfallMmPerHour,
      ),
      iceAccumulationMmPerHour: preferNumber(
        current.iceAccumulationMmPerHour,
        forecastWeather?.iceAccumulationMmPerHour,
      ),
      precipitationType: preferPrecipitationType(
        current.precipitationType,
        forecastWeather?.precipitationType,
      ),
      condition: current.shortCondition ?? forecastWeather?.condition ?? null,
      confidence: current.confidence ?? 0.6,
      selectionMethod: "current",
    };
  }

  if (forecastWeather) return forecastWeather;

  return { confidence: 0, selectionMethod: "missing" };
}

function selectForecastWeather(
  forecastPoints: WeatherForecastPoint[],
  targetTime: number,
): SegmentComfortWeather | null {

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
          heatIndexC: interpolateNullable(before.heatIndexC, after.heatIndexC, ratio),
          windChillC: interpolateNullable(before.windChillC, after.windChillC, ratio),
          dewPointC: interpolateNullable(before.dewPointC, after.dewPointC, ratio),
          relativeHumidity: interpolateNullable(
            before.relativeHumidity,
            after.relativeHumidity,
            ratio,
          ),
          cloudCover: interpolateNullable(before.cloudCover, after.cloudCover, ratio),
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
          snowfallMmPerHour: interpolateNullable(
            before.snowfallMmPerHour,
            after.snowfallMmPerHour,
            ratio,
          ),
          iceAccumulationMmPerHour: interpolateNullable(
            before.iceAccumulationMmPerHour,
            after.iceAccumulationMmPerHour,
            ratio,
          ),
          precipitationType: preferPrecipitationType(
            ratio < 0.5 ? before.precipitationType : after.precipitationType,
            ratio < 0.5 ? after.precipitationType : before.precipitationType,
          ),
          condition: before.shortCondition ?? after.shortCondition ?? null,
          confidence: 0.7,
          selectionMethod: "interpolated-hourly",
        };
      }
    }
  }

  const nearestForecastMatch = forecastPoints
    .map((point) => ({
      point,
      distanceMs: Math.abs(Date.parse(point.timestamp) - targetTime),
    }))
    .sort((left, right) => left.distanceMs - right.distanceMs)[0];
  const nearestForecast =
    nearestForecastMatch && nearestForecastMatch.distanceMs <= NEAREST_FORECAST_MAX_DISTANCE_MS
      ? nearestForecastMatch.point
      : null;

  if (nearestForecast) {
    return {
      temperatureC: nearestForecast.temperatureC,
      apparentTemperatureC: nearestForecast.apparentTemperatureC,
      heatIndexC: nearestForecast.heatIndexC,
      windChillC: nearestForecast.windChillC,
      dewPointC: nearestForecast.dewPointC,
      relativeHumidity: nearestForecast.relativeHumidity,
      cloudCover: nearestForecast.cloudCover,
      regionalWindSpeedMps: nearestForecast.windSpeedMps,
      regionalWindDirectionDeg: nearestForecast.windDirectionDeg,
      precipitationProbability: nearestForecast.precipitationProbability,
      precipitationMmPerHour: nearestForecast.precipitationMmPerHour,
      snowfallMmPerHour: nearestForecast.snowfallMmPerHour,
      iceAccumulationMmPerHour: nearestForecast.iceAccumulationMmPerHour,
      precipitationType: nearestForecast.precipitationType,
      condition: nearestForecast.shortCondition ?? null,
      confidence: 0.62,
      selectionMethod: "nearest-hour",
    };
  }
  return null;
}

function hasComfortWeather(point: WeatherForecastPoint) {
  return (
    (point.temperatureC !== null && point.temperatureC !== undefined) ||
    (point.apparentTemperatureC !== null && point.apparentTemperatureC !== undefined) ||
    (point.relativeHumidity !== null && point.relativeHumidity !== undefined) ||
    (point.cloudCover !== null && point.cloudCover !== undefined) ||
    (point.windSpeedMps !== null && point.windSpeedMps !== undefined) ||
    (point.precipitationProbability !== null &&
      point.precipitationProbability !== undefined) ||
    (point.precipitationMmPerHour !== null &&
      point.precipitationMmPerHour !== undefined) ||
    (point.snowfallMmPerHour !== null && point.snowfallMmPerHour !== undefined) ||
    (point.iceAccumulationMmPerHour !== null &&
      point.iceAccumulationMmPerHour !== undefined)
  );
}

function preferPrecipitationType<T>(
  primary: T | null | undefined,
  fallback: T | null | undefined,
) {
  if (primary !== null && primary !== undefined && primary !== "unknown") return primary;
  return fallback ?? primary ?? null;
}

function interpolateDirection(
  left: number | null | undefined,
  right: number | null | undefined,
  ratio: number,
) {
  if (typeof left !== "number" || !Number.isFinite(left)) return preferNumber(right, null);
  if (typeof right !== "number" || !Number.isFinite(right)) return left;
  const delta = ((right - left + 540) % 360) - 180;
  return ((left + delta * ratio) % 360 + 360) % 360;
}

function preferNumber(
  primary: number | null | undefined,
  fallback: number | null | undefined,
) {
  if (typeof primary === "number" && Number.isFinite(primary)) return primary;
  if (typeof fallback === "number" && Number.isFinite(fallback)) return fallback;
  return null;
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
