import type { Coordinate } from "@/lib/geo/types";
import { assertValidCoordinate } from "@/lib/geo/validation";
import type { WeatherBundle, WeatherProvider } from "@/lib/weather/types";

const cache = new Map<string, { expiresAt: number; value: WeatherBundle }>();

export class WeatherService {
  constructor(
    private readonly provider: WeatherProvider,
    private readonly ttlMs = 5 * 60 * 1000,
  ) {}

  async getWeatherBundle(coordinate: Coordinate): Promise<WeatherBundle> {
    assertValidCoordinate(coordinate, "Weather coordinate");

    const key = `${coordinate.latitude.toFixed(3)},${coordinate.longitude.toFixed(3)}`;
    const cached = cache.get(key);
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
      coordinate,
      current: currentResult.status === "fulfilled" ? currentResult.value : null,
      hourlyForecast:
        forecastResult.status === "fulfilled" ? forecastResult.value : [],
      alerts: alertResult.status === "fulfilled" ? alertResult.value : [],
      source: "National Weather Service",
      updatedAt: new Date().toISOString(),
    };

    cache.set(key, { expiresAt: Date.now() + this.ttlMs, value: bundle });
    return bundle;
  }
}
