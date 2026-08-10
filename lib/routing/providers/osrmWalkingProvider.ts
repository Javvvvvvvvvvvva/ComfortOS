import { assertValidCoordinate, isLineStringGeometry } from "@/lib/geo/validation";
import type {
  RouteCandidate,
  RouteCandidateSet,
  RouteRequest,
  RouteResult,
  RoutingProvider,
} from "@/lib/routing/types";

type OsrmRoute = {
  geometry?: unknown;
  distance?: unknown;
  duration?: unknown;
};

type OsrmRouteResponse = {
  code?: unknown;
  message?: unknown;
  data_version?: unknown;
  routes?: unknown;
  waypoints?: unknown;
};

export type OsrmWalkingProviderOptions = {
  baseUrl: string;
  fetcher?: typeof fetch;
};

export class OsrmWalkingProvider implements RoutingProvider {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: OsrmWalkingProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  async getWalkingRoute(request: RouteRequest): Promise<RouteResult> {
    assertValidCoordinate(request.origin, "Origin");
    assertValidCoordinate(request.destination, "Destination");

    const response = await this.fetcher(this.buildUrl(request, false), {
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Routing request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as OsrmRouteResponse;
    return normalizeOsrmRouteResponse(payload);
  }

  async getWalkingRouteCandidates(request: RouteRequest): Promise<RouteCandidateSet> {
    assertValidCoordinate(request.origin, "Origin");
    assertValidCoordinate(request.destination, "Destination");

    const response = await this.fetcher(this.buildUrl(request, true), {
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Routing request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as OsrmRouteResponse;
    return normalizeOsrmRouteCandidatesResponse(payload);
  }

  private buildUrl(request: RouteRequest, alternatives: boolean): string {
    const { origin, destination } = request;
    const coordinates = [
      `${origin.longitude},${origin.latitude}`,
      ...(request.waypoints ?? []).map(
        (waypoint) => `${waypoint.longitude},${waypoint.latitude}`,
      ),
      `${destination.longitude},${destination.latitude}`,
    ].join(";");

    const url = new URL(
      `${this.baseUrl}/route/v1/foot/${coordinates}`,
    );
    url.searchParams.set("alternatives", alternatives ? "true" : "false");
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("steps", "false");
    return url.toString();
  }
}

export function normalizeOsrmRouteResponse(payload: OsrmRouteResponse): RouteResult {
  return normalizeOsrmRouteCandidatesResponse(payload).candidates[0];
}

export function normalizeOsrmRouteCandidatesResponse(
  payload: OsrmRouteResponse,
): RouteCandidateSet {
  if (payload.code !== "Ok") {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : "Routing provider could not calculate a walking route.";
    throw new Error(message);
  }

  if (!Array.isArray(payload.routes) || payload.routes.length === 0) {
    throw new Error("Routing provider returned no route.");
  }

  const waypointFields = normalizeWaypoints(payload.waypoints);
  const provider = {
    id: "fossgis-osrm-foot",
    dataVersion:
      typeof payload.data_version === "string" ? payload.data_version : undefined,
  };
  const candidates: RouteCandidate[] = [];

  for (const [index, rawRoute] of payload.routes.entries()) {
    const route = rawRoute as OsrmRoute;

    if (!isLineStringGeometry(route.geometry)) {
      throw new Error("Routing provider returned malformed route geometry.");
    }

    if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
      throw new Error("Routing provider returned malformed distance or duration.");
    }

    candidates.push({
      id: `osrm-${index + 1}`,
      sourceRouteIndex: index,
      geometry: route.geometry,
      distanceMeters: route.distance as number,
      durationSeconds: route.duration as number,
      ...waypointFields,
      provider,
      generation: {
        generator: "osrm-alternative",
      },
    });
  }

  return {
    candidates,
    provider,
  };
}

function normalizeWaypoints(waypoints: unknown) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return {};

  const origin = normalizeWaypointCoordinate(waypoints[0]);
  const destination = normalizeWaypointCoordinate(waypoints[waypoints.length - 1]);

  return {
    ...(origin ? { snappedOrigin: origin } : {}),
    ...(destination ? { snappedDestination: destination } : {}),
  };
}

function normalizeWaypointCoordinate(waypoint: unknown) {
  const location = (waypoint as { location?: unknown } | null)?.location;
  if (
    !Array.isArray(location) ||
    location.length < 2 ||
    !Number.isFinite(location[0]) ||
    !Number.isFinite(location[1])
  ) {
    return null;
  }

  return {
    latitude: location[1] as number,
    longitude: location[0] as number,
  };
}
