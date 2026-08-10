import { NextResponse } from "next/server";
import { assertValidCoordinate } from "@/lib/geo/validation";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";

const weatherProvider = new NwsWeatherProvider({
  baseUrl: process.env.WEATHER_BASE_URL,
  userAgent: process.env.WEATHER_USER_AGENT,
});
const weatherService = new WeatherService(weatherProvider);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("lat"));
  const longitude = Number(url.searchParams.get("lon"));

  try {
    const coordinate = { latitude, longitude };
    assertValidCoordinate(coordinate, "Weather coordinate");
    const weather = await weatherService.getWeatherBundle(coordinate);

    return NextResponse.json(
      { weather },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.includes("location")
            ? error.message
            : "Live conditions unavailable.",
      },
      { status: Number.isFinite(latitude) && Number.isFinite(longitude) ? 503 : 400 },
    );
  }
}
