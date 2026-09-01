import { NextResponse } from "next/server";
import { createConfiguredRoutingProvider } from "@/lib/routing/providers/configuredRoutingProvider";
import { RoutingService } from "@/lib/routing/service";
import type { RouteRequest } from "@/lib/routing/types";
import {
  RouteNotFoundError,
  RoutingProviderConfigurationError,
  RoutingProviderUnavailableError,
} from "@/lib/routing/errors";
import { createRequestId, logServerEvent } from "@/lib/observability/serverLog";

export async function POST(request: Request) {
  const requestId = createRequestId(request);
  const startedAt = performance.now();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Request-Id": requestId,
  };

  try {
    const routeRequest = (await request.json()) as RouteRequest;
    const { provider, metadata } = createConfiguredRoutingProvider();
    const service = new RoutingService(provider);
    const route = await service.getFastestWalkingRoute(routeRequest, {
      signal: request.signal,
    });

    logServerEvent("info", "fastest_route_complete", {
      requestId,
      provider: metadata.id,
      providerMode: metadata.mode,
      latencyMs: Math.round(performance.now() - startedAt),
    });
    return NextResponse.json({ route }, { headers });
  } catch (error) {
    if (error instanceof RouteNotFoundError) {
      logServerEvent("warn", "fastest_route_failed", {
        requestId,
        failureCategory: "route_not_found",
        latencyMs: Math.round(performance.now() - startedAt),
      });
      return NextResponse.json(
        { error: "No walking route was found between these points." },
        { status: 404, headers },
      );
    }
    if (
      error instanceof RoutingProviderUnavailableError ||
      error instanceof RoutingProviderConfigurationError
    ) {
      logServerEvent("error", "fastest_route_failed", {
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
    logServerEvent("warn", "fastest_route_failed", {
      requestId,
      failureCategory: "invalid_request",
      latencyMs: Math.round(performance.now() - startedAt),
    });
    return NextResponse.json(
      { error: "Invalid routing request." },
      { status: 400, headers },
    );
  }
}
