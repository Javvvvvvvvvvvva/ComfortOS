import { NextResponse } from "next/server";
import { createConfiguredBuildingProvider } from "@/lib/environment/buildings/providers/configuredBuildingProvider";
import { WindAnalysisService } from "@/lib/environment/wind/windService";
import type { WindAnalysisRequest } from "@/lib/environment/wind/types";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";

const { provider: buildingProvider } = createConfiguredBuildingProvider();
const weatherProvider = new NwsWeatherProvider({
  baseUrl: process.env.WEATHER_BASE_URL,
  userAgent: process.env.WEATHER_USER_AGENT,
});
const windService = new WindAnalysisService(
  buildingProvider,
  new WeatherService(weatherProvider),
);

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as WindAnalysisRequest;
    const wind = await windService.analyzeRouteWind(payload);

    return NextResponse.json(
      { wind },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Wind estimate unavailable." },
      { status: 503 },
    );
  }
}
