import type { ComfortRouteComparisonRequest } from "@/lib/comfort-routing/service";

export function enforceServerWeatherForPublicRequest(
  request: ComfortRouteComparisonRequest,
): ComfortRouteComparisonRequest {
  return {
    ...request,
    weatherCoordinate: request.origin,
    weatherBundle: undefined,
  };
}
