import type { RouteRequest, RouteResult } from "./types";
import type {
  ComfortRouteComparisonRequest,
} from "@/lib/comfort-routing/service";
import type { ComfortRouteComparisonResult } from "@/lib/comfort-routing/types";

export async function requestFastestWalkingRoute(
  request: RouteRequest,
): Promise<RouteResult> {
  const response = await fetch("/api/routes/walking", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const payload = (await response.json()) as { route?: RouteResult; error?: string };

  if (!response.ok || !payload.route) {
    throw new Error(payload.error ?? "Unable to calculate a walking route.");
  }

  return payload.route;
}

export async function requestComfortRouteComparison(
  request: ComfortRouteComparisonRequest,
): Promise<ComfortRouteComparisonResult> {
  const response = await fetch("/api/routes/comfort-comparison", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const payload = (await response.json()) as {
    comparison?: ComfortRouteComparisonResult;
    error?: string;
  };

  if (!response.ok || !payload.comparison) {
    throw new Error(payload.error ?? "Unable to compare walking routes.");
  }

  return payload.comparison;
}
