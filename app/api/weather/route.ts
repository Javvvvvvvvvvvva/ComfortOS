import { NextResponse } from "next/server";
import { isValidCoordinate } from "@/lib/geo/validation";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";
import { createRequestId, logServerEvent } from "@/lib/observability/serverLog";
import { API_RATE_LIMITS, checkRequestRateLimit } from "@/lib/api/rateLimit";

const weatherProvider = new NwsWeatherProvider({
  baseUrl: process.env.WEATHER_BASE_URL,
  userAgent: process.env.WEATHER_USER_AGENT,
});
const weatherService = new WeatherService(weatherProvider);

export async function GET(request: Request) {
  const requestId = createRequestId(request);
  const startedAt = performance.now();
  const rateLimit = checkRequestRateLimit(request, API_RATE_LIMITS.weather);
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Request-Id": requestId,
    ...rateLimit.headers,
  };
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { code: "RATE_LIMITED", error: "Too many weather requests. Please try again shortly." },
      { status: 429, headers },
    );
  }
  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("lat"));
  const longitude = Number(url.searchParams.get("lon"));
  const coordinate = { latitude, longitude };

  if (!isValidCoordinate(coordinate)) {
    return NextResponse.json(
      { error: "Invalid weather coordinate." },
      { status: 400, headers },
    );
  }

  try {
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
      { headers },
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
        status: 503,
        headers,
      },
    );
  }
}
