import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { decideRoutingContext } from "@/lib/comfort-routing/contextualMode";
import type { Coordinate } from "@/lib/geo/types";
import { selectComfortWeatherForTime } from "@/lib/comfort/context";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";

const LOCATIONS: Array<{ name: string; coordinate: Coordinate }> = [
  { name: "Minneapolis", coordinate: { latitude: 44.9778, longitude: -93.265 } },
  { name: "Seattle", coordinate: { latitude: 47.6062, longitude: -122.3321 } },
  { name: "Phoenix", coordinate: { latitude: 33.4484, longitude: -112.074 } },
];

if (existsSync(".env.local")) loadEnvFile(".env.local");

const provider = new NwsWeatherProvider({
  baseUrl: process.env.WEATHER_BASE_URL,
  userAgent: process.env.WEATHER_USER_AGENT,
});
const service = new WeatherService(provider, 0);
const atTime = new Date().toISOString();
const results = [];
let failed = false;

for (const location of LOCATIONS) {
  try {
    const bundle = await service.getWeatherBundle(location.coordinate);
    const selected = selectComfortWeatherForTime(bundle, atTime);
    const quality = bundle.quality;
    const checks = {
      usableAtCurrentTime: selected.selectionMethod !== "missing",
      temperatureAvailable: typeof selected.temperatureC === "number",
      humidityAvailable: typeof selected.relativeHumidity === "number",
      windAvailable:
        typeof selected.regionalWindSpeedMps === "number" &&
        typeof selected.regionalWindDirectionDeg === "number",
      forecastAvailable: bundle.hourlyForecast.length >= 12,
      forecastHumidityCoverage: (quality?.humidityCoverage ?? 0) >= 0.9,
      forecastCloudCoverage: (quality?.cloudCoverCoverage ?? 0) >= 0.9,
      forecastWindCoverage: (quality?.windCoverage ?? 0) >= 0.9,
      forecastSnowfallCoverage: (quality?.snowfallCoverage ?? 0) >= 0.9,
      forecastIceAccumulationCoverage:
        (quality?.iceAccumulationCoverage ?? 0) >= 0.9,
    };
    const passed = Object.values(checks).every(Boolean);
    failed ||= !passed;
    results.push({
      location: location.name,
      passed,
      checks,
      selectionMethod: selected.selectionMethod,
      context: decideRoutingContext(bundle, {
        rainCapable: false,
        heatCapable: true,
        atTime,
      }).context,
      current: bundle.current
        ? {
            temperatureC: bundle.current.temperatureC,
            relativeHumidity: bundle.current.relativeHumidity ?? null,
            dewPointC: bundle.current.dewPointC ?? null,
            cloudCover: bundle.current.cloudCover ?? null,
            windSpeedMps: bundle.current.windSpeedMps ?? null,
            heatIndexC: bundle.current.heatIndexC ?? null,
            windChillC: bundle.current.windChillC ?? null,
            observationAgeMinutes: round(bundle.current.observationAgeMinutes),
            stationDistanceKm: round(
              (bundle.current.observationStationDistanceMeters ?? 0) / 1000,
            ),
          }
        : null,
      selected: {
        temperatureC: selected.temperatureC ?? null,
        relativeHumidity: selected.relativeHumidity ?? null,
        dewPointC: selected.dewPointC ?? null,
        cloudCover: selected.cloudCover ?? null,
        windSpeedMps: selected.regionalWindSpeedMps ?? null,
        precipitationMmPerHour: selected.precipitationMmPerHour ?? null,
        snowfallMmPerHour: selected.snowfallMmPerHour ?? null,
        iceAccumulationMmPerHour: selected.iceAccumulationMmPerHour ?? null,
        precipitationType: selected.precipitationType ?? null,
      },
      forecastPointCount: bundle.hourlyForecast.length,
      quality,
    });
  } catch (error) {
    failed = true;
    results.push({
      location: location.name,
      passed: false,
      error: error instanceof Error ? error.message : "Weather validation failed.",
    });
  }
}

console.log(
  JSON.stringify(
    {
      status: failed ? "failed" : "passed",
      provider: "National Weather Service",
      checkedAt: atTime,
      results,
    },
    null,
    2,
  ),
);

if (failed) process.exitCode = 1;

function round(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 10) / 10
    : null;
}
