import { NextResponse } from "next/server";
import { ComfortRouteComparisonService } from "@/lib/comfort-routing/service";
import type { ComfortRouteComparisonRequest } from "@/lib/comfort-routing/service";
import { createConfiguredBuildingProvider } from "@/lib/environment/buildings/providers/configuredBuildingProvider";
import { createConfiguredCoveredFeatureProvider } from "@/lib/environment/coveredFeatures/providers/configuredCoveredFeatureProvider";
import { ShadeAnalysisService } from "@/lib/environment/shade/service";
import { WindAnalysisService } from "@/lib/environment/wind/windService";
import { CompositeCandidateGenerator } from "@/lib/routing/generators/compositeCandidateGenerator";
import { CorridorWaypointGenerator } from "@/lib/routing/generators/corridorWaypointGenerator";
import { ProviderAlternativeGenerator } from "@/lib/routing/generators/providerAlternativeGenerator";
import { createConfiguredRoutingProvider } from "@/lib/routing/providers/configuredRoutingProvider";
import { RoutingService } from "@/lib/routing/service";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";
import {
  RoutingProviderConfigurationError,
  RoutingProviderUnavailableError,
} from "@/lib/routing/errors";
import { createRequestId, logServerEvent } from "@/lib/observability/serverLog";

let comparisonService: ComfortRouteComparisonService | null = null;

function getComparisonService() {
  if (comparisonService) return comparisonService;
  const { provider: routingProvider } = createConfiguredRoutingProvider();
  const { provider: buildingProvider, mode: buildingProviderMode } =
    createConfiguredBuildingProvider();
  const { provider: coveredFeatureProvider, mode: coveredFeatureProviderMode } =
    createConfiguredCoveredFeatureProvider();
  const weatherService = new WeatherService(
    new NwsWeatherProvider({
      baseUrl: process.env.WEATHER_BASE_URL,
      userAgent: process.env.WEATHER_USER_AGENT,
    }),
  );
  const routingService = new RoutingService(routingProvider);
  const candidateGenerator = new CompositeCandidateGenerator([
    new ProviderAlternativeGenerator(routingService),
    new CorridorWaypointGenerator(routingService),
  ]);
  comparisonService = new ComfortRouteComparisonService(
    routingService,
    candidateGenerator,
    weatherService,
    buildingProvider,
    new ShadeAnalysisService(buildingProvider),
    new WindAnalysisService(buildingProvider, weatherService),
    undefined,
    buildingProviderMode,
    coveredFeatureProvider,
    coveredFeatureProviderMode,
  );
  return comparisonService;
}

export async function POST(request: Request) {
  const requestId = createRequestId(request);
  const startedAt = performance.now();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Request-Id": requestId,
  };

  try {
    const payload = (await request.json()) as ComfortRouteComparisonRequest;
    const comparison = await getComparisonService().compareWalkingRoutes(payload, {
      signal: request.signal,
    });

    logServerEvent("info", "comfort_route_complete", {
      requestId,
      provider: comparison.debug.routingProvider?.id,
      providerMode: comparison.debug.routingProvider?.mode,
      region: comparison.debug.buildings?.region ?? "unknown",
      context: comparison.debug.context?.context ?? "balanced",
      latencyMs: comparison.debug.performanceMs?.total ??
        Math.round(performance.now() - startedAt),
      candidateCount: comparison.candidates.length,
      managedRoutingRequests: comparison.debug.routingUsage?.totalRequests,
      limitedData: !comparison.candidates.some(
        (candidate) => candidate.comfortAnalysis?.routeComfortCost.comparable === true,
      ),
    });
    return NextResponse.json(
      { comparison },
      { headers },
    );
  } catch (error) {
    if (
      error instanceof RoutingProviderUnavailableError ||
      error instanceof RoutingProviderConfigurationError
    ) {
      logServerEvent("error", "comfort_route_failed", {
        requestId,
        failureCategory: "routing_provider",
        latencyMs: Math.round(performance.now() - startedAt),
      });
      return NextResponse.json(
        {
          code: "ROUTING_UNAVAILABLE",
          error: "Walking route temporarily unavailable. Please try again.",
        },
        { status: 503, headers },
      );
    }
    logServerEvent("error", "comfort_route_failed", {
      requestId,
      failureCategory: "environment_or_provider",
      latencyMs: Math.round(performance.now() - startedAt),
    });
    return NextResponse.json(
      { error: "Comfort route comparison unavailable. Please try again." },
      { status: 503, headers },
    );
  }
}
