import { NextResponse } from "next/server";
import { ComfortRouteComparisonService } from "@/lib/comfort-routing/service";
import type { ComfortRouteComparisonRequest } from "@/lib/comfort-routing/service";
import { createConfiguredBuildingProvider } from "@/lib/environment/buildings/providers/configuredBuildingProvider";
import { ShadeAnalysisService } from "@/lib/environment/shade/service";
import { WindAnalysisService } from "@/lib/environment/wind/windService";
import { CompositeCandidateGenerator } from "@/lib/routing/generators/compositeCandidateGenerator";
import { CorridorWaypointGenerator } from "@/lib/routing/generators/corridorWaypointGenerator";
import { OsrmAlternativeGenerator } from "@/lib/routing/generators/osrmAlternativeGenerator";
import { OsrmWalkingProvider } from "@/lib/routing/providers/osrmWalkingProvider";
import { RoutingService } from "@/lib/routing/service";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";

const DEFAULT_OSRM_BASE_URL = "https://routing.openstreetmap.de/routed-foot";

const routingProvider = new OsrmWalkingProvider({
  baseUrl:
    process.env.ROUTING_OSRM_BASE_URL ??
    process.env.ROUTING_BASE_URL ??
    DEFAULT_OSRM_BASE_URL,
});
const { provider: buildingProvider, mode: buildingProviderMode } =
  createConfiguredBuildingProvider();
const weatherProvider = new NwsWeatherProvider({
  baseUrl: process.env.WEATHER_BASE_URL,
  userAgent: process.env.WEATHER_USER_AGENT,
});
const weatherService = new WeatherService(weatherProvider);
const routingService = new RoutingService(routingProvider);
const candidateGenerator = new CompositeCandidateGenerator([
  new OsrmAlternativeGenerator(routingService),
  new CorridorWaypointGenerator(routingService),
]);
const comparisonService = new ComfortRouteComparisonService(
  routingService,
  candidateGenerator,
  weatherService,
  buildingProvider,
  new ShadeAnalysisService(buildingProvider),
  new WindAnalysisService(buildingProvider, weatherService),
  undefined,
  buildingProviderMode,
);

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ComfortRouteComparisonRequest;
    const comparison = await comparisonService.compareWalkingRoutes(payload);

    return NextResponse.json(
      { comparison },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Comfort route comparison unavailable.",
      },
      { status: 503 },
    );
  }
}
