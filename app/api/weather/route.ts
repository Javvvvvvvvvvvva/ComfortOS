import { NextResponse } from "next/server";
import { assertValidCoordinate } from "@/lib/geo/validation";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";
import { createRequestId, logServerEvent } from "@/lib/observability/serverLog";

const weatherProvider = new NwsWeatherProvider({
  baseUrl: process.env.WEATHER_BASE_URL,
  userAgent: process.env.WEATHER_USER_AGENT,
});
const weatherService = new WeatherService(weatherProvider);

export async function GET(request: Request) {
  const requestId = createRequestId(request);
  const startedAt = performance.now();
  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("lat"));
  const longitude = Number(url.searchParams.get("lon"));

  try {
    const coordinate = { latitude, longitude };
    assertValidCoordinate(coordinate, "Weather coordinate");
    const weather = await weatherService.getWeatherBundle(coordinate);

    logServerEvent("info", "weather_complete", {
      requestId,
      provider: "nws",
      latencyMs: Math.round(performance.now() - startedAt),
      currentAvailable: weather.current !== null,
      forecastPointCount: weather.hourlyForecast.length,
      alertCount: weather.alerts.length,
    });

    return NextResponse.json(
      { weather },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-Id": requestId,
        },
      },
    );
  } catch (error) {
    logServerEvent("warn", "weather_failed", {
      requestId,
      failureCategory: "weather_provider",
      latencyMs: Math.round(performance.now() - startedAt),
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.includes("location")
            ? error.message
            : "Live conditions unavailable.",
      },
      {
        status: Number.isFinite(latitude) && Number.isFinite(longitude) ? 503 : 400,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-Id": requestId,
        },
      },
    );
  }
}
