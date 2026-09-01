import type {
  RouteCandidateSet,
  RouteRequest,
  RouteResult,
  RoutingProvider,
  RoutingProviderHealth,
  RoutingProviderMetadata,
  RoutingRequestOptions,
} from "./types";
import { assertValidCoordinate } from "@/lib/geo/validation";

export class RoutingService {
  constructor(private readonly provider: RoutingProvider) {}

  async getFastestWalkingRoute(
    request: RouteRequest,
    options?: RoutingRequestOptions,
  ): Promise<RouteResult> {
    validateRouteRequest(request);
    const requestOptions = { usageCategory: "fastest" as const, ...options };
    return recordRoutingRequest(requestOptions, () =>
      this.provider.getWalkingRoute(request, requestOptions),
    );
  }

  async getWalkingRouteCandidates(
    request: RouteRequest,
    options?: RoutingRequestOptions,
  ): Promise<RouteCandidateSet> {
    validateRouteRequest(request);

    const requestOptions = { usageCategory: "candidate" as const, ...options };
    return recordRoutingRequest(requestOptions, async () => {
      if (this.provider.getWalkingRouteCandidates) {
        return this.provider.getWalkingRouteCandidates(request, requestOptions);
      }

      const route = await this.provider.getWalkingRoute(request, requestOptions);
      return {
        candidates: [{ ...route, id: "fastest-1", sourceRouteIndex: 0 }],
        provider: route.provider,
      };
    });
  }

  async getProviderMetadata(): Promise<RoutingProviderMetadata | null> {
    return (await this.provider.getMetadata?.()) ?? null;
  }

  async checkProviderHealth(
    options?: RoutingRequestOptions,
  ): Promise<RoutingProviderHealth | null> {
    return (await this.provider.checkHealth?.(options)) ?? null;
  }
}

async function recordRoutingRequest<T>(
  options: RoutingRequestOptions,
  request: () => Promise<T>,
) {
  const metrics = options.usageMetrics;
  const category = options.usageCategory;
  if (metrics && category !== "health") {
    metrics.totalRequests += 1;
    if (category === "candidate") metrics.candidateRequests += 1;
    else metrics.fastestRequests += 1;
  }

  try {
    return await request();
  } catch (error) {
    if (metrics && category !== "health") metrics.failedRequests += 1;
    throw error;
  }
}

function validateRouteRequest(request: RouteRequest) {
  assertValidCoordinate(request.origin, "Origin");
  assertValidCoordinate(request.destination, "Destination");
  for (const [index, waypoint] of (request.waypoints ?? []).entries()) {
    assertValidCoordinate(waypoint, `Waypoint ${index + 1}`);
  }

  if (!request.departureTime || Number.isNaN(Date.parse(request.departureTime))) {
    throw new Error("Departure time must be a valid ISO timestamp.");
  }
}
