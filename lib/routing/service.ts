import type { RouteCandidateSet, RouteRequest, RouteResult, RoutingProvider } from "./types";
import { assertValidCoordinate } from "@/lib/geo/validation";

export class RoutingService {
  constructor(private readonly provider: RoutingProvider) {}

  async getFastestWalkingRoute(request: RouteRequest): Promise<RouteResult> {
    validateRouteRequest(request);

    return this.provider.getWalkingRoute(request);
  }

  async getWalkingRouteCandidates(request: RouteRequest): Promise<RouteCandidateSet> {
    validateRouteRequest(request);

    if (this.provider.getWalkingRouteCandidates) {
      return this.provider.getWalkingRouteCandidates(request);
    }

    const route = await this.provider.getWalkingRoute(request);
    return {
      candidates: [{ ...route, id: "fastest-1", sourceRouteIndex: 0 }],
      provider: route.provider,
    };
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
