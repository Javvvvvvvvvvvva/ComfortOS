import type { Coordinate } from "@/lib/geo/types";
import { assertValidCoordinate } from "@/lib/geo/validation";
import { weatherBundleMatchesCoordinate } from "@/lib/weather/location";
import { WEATHER_NORMALIZATION_VERSION } from "@/lib/comfort/modelVersion";
import type {
  WeatherBundle,
  WeatherDataQuality,
  WeatherForecastPoint,
  WeatherProvider,
} from "@/lib/weather/types";

export class WeatherService {
  private readonly cache = new Map<string, { expiresAt: number; value: WeatherBundle }>();

  constructor(
    private readonly provider: WeatherProvider,
    private readonly ttlMs = 5 * 60 * 1000,
  ) {}

  async getWeatherBundle(coordinate: Coordinate): Promise<WeatherBundle> {
    assertValidCoordinate(coordinate, "Weather coordinate");

    const key = `${coordinate.latitude.toFixed(3)},${coordinate.longitude.toFixed(3)}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const [currentResult, forecastResult, alertResult] = await Promise.allSettled([
      this.provider.getCurrentWeather(coordinate),
      this.provider.getHourlyForecast(coordinate),
      this.provider.getActiveAlerts(coordinate),
    ]);

    if (currentResult.status === "rejected" && forecastResult.status === "rejected") {
      throw currentResult.reason instanceof Error
        ? currentResult.reason
        : new Error("Live conditions unavailable.");
    }

    const bundle: WeatherBundle = {
      normalizationVersion: WEATHER_NORMALIZATION_VERSION,
      coordinate,
      current: currentResult.status === "fulfilled" ? currentResult.value : null,
      hourlyForecast:
        forecastResult.status === "fulfilled" ? forecastResult.value : [],
      alerts: alertResult.status === "fulfilled" ? alertResult.value : [],
      source: "National Weather Service",
      updatedAt: new Date().toISOString(),
      quality: summarizeWeatherDataQuality(
        currentResult.status === "fulfilled" ? currentResult.value : null,
        forecastResult.status === "fulfilled" ? forecastResult.value : [],
      ),
    };

    this.cache.set(key, { expiresAt: Date.now() + this.ttlMs, value: bundle });
    return bundle;
  }
}

export async function resolveCoordinateScopedWeather(
  weatherService: Pick<WeatherService, "getWeatherBundle">,
  coordinate: Coordinate,
  suppliedBundle?: WeatherBundle,
): Promise<{
  bundle: WeatherBundle;
  source: "request-bundle" | "provider-fetch";
  suppliedBundleAccepted: boolean;
}> {
  assertValidCoordinate(coordinate, "Weather coordinate");
  if (
    suppliedBundle &&
    weatherBundleMatchesCoordinate(suppliedBundle.coordinate, coordinate)
  ) {
    return {
      bundle: suppliedBundle,
      source: "request-bundle",
      suppliedBundleAccepted: true,
    };
  }
  return {
    bundle: await weatherService.getWeatherBundle(coordinate),
    source: "provider-fetch",
    suppliedBundleAccepted: false,
  };
}

function summarizeWeatherDataQuality(
  current: WeatherBundle["current"],
  forecast: WeatherForecastPoint[],
): WeatherDataQuality {
  const observationAge = current?.observationAgeMinutes ?? ageMinutes(current?.timestamp);
  return {
    currentObservationAgeMinutes: observationAge,
    currentObservationFresh: observationAge !== null && observationAge <= 45,
    currentObservationStationDistanceMeters:
      current?.observationStationDistanceMeters ?? null,
    forecastPointCount: forecast.length,
    humidityCoverage: coverage(forecast, (point) => point.relativeHumidity),
    cloudCoverCoverage: coverage(forecast, (point) => point.cloudCover),
    windCoverage: coverage(forecast, (point) => point.windSpeedMps),
    snowfallCoverage: coverage(forecast, (point) => point.snowfallMmPerHour),
    iceAccumulationCoverage: coverage(
      forecast,
      (point) => point.iceAccumulationMmPerHour,
    ),
  };
}

function coverage(
  points: WeatherForecastPoint[],
  selector: (point: WeatherForecastPoint) => number | null | undefined,
) {
  if (points.length === 0) return 0;
  return (
    points.filter((point) => {
      const value = selector(point);
      return typeof value === "number" && Number.isFinite(value);
    }).length / points.length
  );
}

function ageMinutes(timestamp: string | undefined) {
  if (!timestamp) return null;
  const value = Date.parse(timestamp);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, (Date.now() - value) / 60_000);
}
