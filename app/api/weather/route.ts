import { NextResponse } from "next/server";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";
import { createRequestId, logServerEvent } from "@/lib/observability/serverLog";
import { API_RATE_LIMITS, checkRequestRateLimit } from "@/lib/api/rateLimit";
import {
  parseCoordinateBody,
  requireJsonObject,
} from "@/lib/api/locationRequestBody";

const weatherProvider = new NwsWeatherProvider({
  baseUrl: process.env.WEATHER_BASE_URL,
  userAgent: process.env.WEATHER_USER_AGENT,
});
const weatherService = new WeatherService(weatherProvider);

export async function POST(request: Request) {
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
  try {
    const payload = requireJsonObject(await request.json());
    const coordinate = parseCoordinateBody(payload.coordinate);
    if (!coordinate) {
      return NextResponse.json(
        { error: "Invalid weather coordinate." },
        { status: 400, headers },
      );
    }
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
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid weather request." },
        { status: 400, headers },
      );
    }
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
