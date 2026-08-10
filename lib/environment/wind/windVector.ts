import type { WindState } from "@/lib/environment/wind/types";
import type { WeatherBundle, WeatherForecastPoint } from "@/lib/weather/types";

export function normalizeDegrees(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

export function angleDeltaDeg(leftDeg: number, rightDeg: number) {
  const delta = Math.abs(normalizeDegrees(leftDeg) - normalizeDegrees(rightDeg));
  return delta > 180 ? 360 - delta : delta;
}

export function bearingVector(degrees: number): [number, number] {
  const radians = (normalizeDegrees(degrees) * Math.PI) / 180;
  return [Math.sin(radians), Math.cos(radians)];
}

export function calculateWindComponents({
  pedestrianBearingDeg,
  windFromDeg,
  windSpeedMps,
}: {
  pedestrianBearingDeg: number;
  windFromDeg: number;
  windSpeedMps: number;
}) {
  const speed = Math.max(0, Number.isFinite(windSpeedMps) ? windSpeedMps : 0);
  if (speed === 0) {
    return {
      relativeWindAngleDeg: 0,
      headwindComponentMps: 0,
      crosswindComponentMps: 0,
      tailwindComponentMps: 0,
    };
  }

  const relativeWindAngleDeg = angleDeltaDeg(pedestrianBearingDeg, windFromDeg);
  const relativeRadians = (relativeWindAngleDeg * Math.PI) / 180;
  const along = speed * Math.cos(relativeRadians);

  return {
    relativeWindAngleDeg,
    headwindComponentMps: Math.max(0, along),
    crosswindComponentMps: Math.abs(speed * Math.sin(relativeRadians)),
    tailwindComponentMps: Math.max(0, -along),
  };
}

export function selectWindStateForTime(
  weatherBundle: WeatherBundle,
  timestamp: string,
): WindState | null {
  const targetTime = new Date(timestamp).valueOf();
  if (Number.isNaN(targetTime)) return null;

  const forecastPoints = weatherBundle.hourlyForecast
    .filter(hasWind)
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  const current = weatherBundle.current;

  if (forecastPoints.length >= 2) {
    for (let index = 0; index < forecastPoints.length - 1; index += 1) {
      const before = forecastPoints[index];
      const after = forecastPoints[index + 1];
      const beforeTime = Date.parse(before.timestamp);
      const afterTime = Date.parse(after.timestamp);
      if (targetTime >= beforeTime && targetTime <= afterTime && afterTime > beforeTime) {
        const ratio = (targetTime - beforeTime) / (afterTime - beforeTime);
        return {
          timestamp,
          speedMps: interpolate(before.windSpeedMps ?? 0, after.windSpeedMps ?? 0, ratio),
          directionFromDeg: interpolateDegrees(
            before.windDirectionDeg ?? 0,
            after.windDirectionDeg ?? 0,
            ratio,
          ),
          source: weatherBundle.source,
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
      timestamp: nearestForecast.timestamp,
      speedMps: nearestForecast.windSpeedMps ?? 0,
      directionFromDeg: nearestForecast.windDirectionDeg ?? 0,
      source: weatherBundle.source,
      confidence: 0.62,
      selectionMethod: "nearest-hour",
    };
  }

  if (
    current?.windSpeedMps !== null &&
    current?.windSpeedMps !== undefined &&
    current.windDirectionDeg !== null &&
    current.windDirectionDeg !== undefined
  ) {
    return {
      timestamp: current.timestamp,
      speedMps: current.windSpeedMps,
      directionFromDeg: current.windDirectionDeg,
      source: current.source,
      confidence: current.confidence ?? 0.6,
      selectionMethod: "current",
    };
  }

  return null;
}

function hasWind(point: WeatherForecastPoint) {
  return (
    point.windSpeedMps !== null &&
    point.windSpeedMps !== undefined &&
    point.windDirectionDeg !== null &&
    point.windDirectionDeg !== undefined
  );
}

function interpolate(left: number, right: number, ratio: number) {
  return left + (right - left) * ratio;
}

function interpolateDegrees(leftDeg: number, rightDeg: number, ratio: number) {
  const left = normalizeDegrees(leftDeg);
  const right = normalizeDegrees(rightDeg);
  const delta = ((right - left + 540) % 360) - 180;
  return normalizeDegrees(left + delta * ratio);
}
