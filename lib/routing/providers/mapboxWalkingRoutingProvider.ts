import { assertValidCoordinate, isLineStringGeometry } from "@/lib/geo/validation";
import {
  RouteNotFoundError,
  RoutingProviderConfigurationError,
  RoutingProviderRateLimitError,
  RoutingProviderUnauthorizedError,
  RoutingProviderUnavailableError,
} from "@/lib/routing/errors";
import { createRoutingRequestSignal } from "@/lib/routing/requestTimeout";
import type {
  RouteCandidate,
  RouteCandidateSet,
  RouteRequest,
  RouteResult,
  RoutingProvider,
  RoutingProviderHealth,
  RoutingProviderMetadata,
  RoutingRequestOptions,
} from "@/lib/routing/types";

type MapboxRoute = {
  geometry?: unknown;
  distance?: unknown;
  duration?: unknown;
  waypoints?: unknown;
};

type MapboxDirectionsResponse = {
  code?: unknown;
  message?: unknown;
  routes?: unknown;
  waypoints?: unknown;
};

export type MapboxWalkingRoutingProviderOptions = {
  accessToken: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  metadata?: Partial<RoutingProviderMetadata>;
  requestTimeoutMs?: number;
  healthCheckRequest?: RouteRequest;
  walkwayBias?: number;
};

const DEFAULT_MAPBOX_DIRECTIONS_BASE_URL = "https://api.mapbox.com/directions/v5";
const MAX_MAPBOX_COORDINATES = 25;

export class MapboxWalkingRoutingProvider implements RoutingProvider {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly metadata: RoutingProviderMetadata;
  private readonly requestTimeoutMs: number;
  private readonly healthCheckRequest: RouteRequest;
  private readonly walkwayBias?: number;

  constructor(options: MapboxWalkingRoutingProviderOptions) {
    if (!isValidMapboxAccessToken(options.accessToken)) {
      throw new RoutingProviderConfigurationError(
        "MAPBOX_ACCESS_TOKEN is missing or invalid for ROUTING_PROVIDER=mapbox-managed.",
      );
    }
    if (
      options.walkwayBias !== undefined &&
      (!Number.isFinite(options.walkwayBias) ||
        options.walkwayBias < -1 ||
        options.walkwayBias > 1)
    ) {
      throw new RoutingProviderConfigurationError(
        "MAPBOX_WALKWAY_BIAS must be a number between -1 and 1.",
      );
    }

    this.accessToken = options.accessToken.trim();
    this.baseUrl = normalizeMapboxBaseUrl(
      options.baseUrl ?? DEFAULT_MAPBOX_DIRECTIONS_BASE_URL,
    );
    this.fetcher = options.fetcher ?? fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 8_000;
    this.walkwayBias = options.walkwayBias;
    this.metadata = {
      id: "mapbox-directions-walking",
      name: "Mapbox",
      mode: "managed",
      profile: "walking",
      baseUrl: this.baseUrl,
      endpointFamily: "Directions API v5",
      productionEligible: true,
      capabilities: {
        alternatives: true,
        waypoints: true,
        maxCoordinates: MAX_MAPBOX_COORDINATES,
        timeDependent: false,
      },
      ...options.metadata,
    };
    this.healthCheckRequest =
      options.healthCheckRequest ??
      {
        origin: { latitude: 44.977753, longitude: -93.265011 },
        destination: { latitude: 44.979753, longitude: -93.263011 },
        departureTime: "2026-01-01T12:00:00.000Z",
      };
  }

  getMetadata(): RoutingProviderMetadata {
    return this.metadata;
  }

  async checkHealth(options?: RoutingRequestOptions): Promise<RoutingProviderHealth> {
    const startedAt = performance.now();
    try {
      await this.getWalkingRoute(this.healthCheckRequest, options);
      return {
        ok: true,
        status: "ready",
        latencyMs: Math.round(performance.now() - startedAt),
        provider: this.metadata,
      };
    } catch (error) {
      return {
        ok: false,
        status: "unavailable",
        latencyMs: Math.round(performance.now() - startedAt),
        provider: this.metadata,
        message: error instanceof Error ? error.message : "Mapbox routing unavailable.",
      };
    }
  }

  async getWalkingRoute(
    request: RouteRequest,
    options?: RoutingRequestOptions,
  ): Promise<RouteResult> {
    validateMapboxRouteRequest(request);
    const response = await this.fetchRoute(request, false, options);
    if (!response.ok) throw mapboxHttpError(response.status);

    const payload = (await response.json()) as MapboxDirectionsResponse;
    return normalizeMapboxRouteResponse(payload, this.metadata);
  }

  async getWalkingRouteCandidates(
    request: RouteRequest,
    options?: RoutingRequestOptions,
  ): Promise<RouteCandidateSet> {
    validateMapboxRouteRequest(request);
    const response = await this.fetchRoute(request, true, options);
    if (!response.ok) throw mapboxHttpError(response.status);

    const payload = (await response.json()) as MapboxDirectionsResponse;
    return normalizeMapboxRouteCandidatesResponse(payload, this.metadata);
  }

  private async fetchRoute(
    request: RouteRequest,
    alternatives: boolean,
    options?: RoutingRequestOptions,
  ) {
    const requestSignal = createRoutingRequestSignal(
      options?.signal,
      this.requestTimeoutMs,
    );
    try {
      return await this.fetcher(this.buildUrl(request, alternatives), {
        headers: { accept: "application/json" },
        signal: requestSignal.signal,
      });
    } catch (error) {
      return requestSignal.classifyError(error, "Mapbox routing");
    } finally {
      requestSignal.dispose();
    }
  }

  private buildUrl(request: RouteRequest, alternatives: boolean) {
    const coordinates = [
      request.origin,
      ...(request.waypoints ?? []),
      request.destination,
    ]
      .map((coordinate) => `${coordinate.longitude},${coordinate.latitude}`)
      .join(";");
    const url = new URL(`${this.baseUrl}/mapbox/walking/${coordinates}`);
    url.searchParams.set("access_token", this.accessToken);
    url.searchParams.set("alternatives", alternatives ? "true" : "false");
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("steps", "false");
    if (alternatives) url.searchParams.set("waypoints_per_route", "true");
    if (this.walkwayBias !== undefined) {
      url.searchParams.set("walkway_bias", String(this.walkwayBias));
    }
    return url.toString();
  }
}

export function normalizeMapboxRouteResponse(
  payload: MapboxDirectionsResponse,
  providerMetadata = defaultMapboxMetadata(),
): RouteResult {
  return normalizeMapboxRouteCandidatesResponse(payload, providerMetadata).candidates[0];
}

export function normalizeMapboxRouteCandidatesResponse(
  payload: MapboxDirectionsResponse,
  providerMetadata = defaultMapboxMetadata(),
): RouteCandidateSet {
  if (payload.code !== "Ok") {
    if (payload.code === "NoRoute") {
      throw new RouteNotFoundError("Mapbox found no walking route.");
    }
    throw new RoutingProviderUnavailableError(
      "Mapbox routing returned an unsuccessful response.",
    );
  }
  if (!Array.isArray(payload.routes) || payload.routes.length === 0) {
    throw new RouteNotFoundError("Mapbox returned no walking route.");
  }

  const provider = { id: providerMetadata.id };
  const candidates: RouteCandidate[] = payload.routes.map((rawRoute, index) => {
    const route = rawRoute as MapboxRoute;
    if (!isLineStringGeometry(route.geometry)) {
      throw new Error("Mapbox returned malformed route geometry.");
    }
    if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
      throw new Error("Mapbox returned malformed distance or duration.");
    }

    return {
      id: `mapbox-${index + 1}`,
      sourceRouteIndex: index,
      geometry: route.geometry,
      distanceMeters: route.distance as number,
      durationSeconds: route.duration as number,
      ...normalizeWaypoints(route.waypoints ?? payload.waypoints),
      provider,
      generation: { generator: "provider-alternative" },
    };
  });

  return { candidates, provider };
}

export function isValidMapboxAccessToken(value: string | undefined) {
  if (!value) return false;
  return /^(pk|sk)\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.trim());
}

function defaultMapboxMetadata(): RoutingProviderMetadata {
  return {
    id: "mapbox-directions-walking",
    name: "Mapbox",
    mode: "managed",
    profile: "walking",
    baseUrl: DEFAULT_MAPBOX_DIRECTIONS_BASE_URL,
    endpointFamily: "Directions API v5",
    productionEligible: true,
    capabilities: {
      alternatives: true,
      waypoints: true,
      maxCoordinates: MAX_MAPBOX_COORDINATES,
      timeDependent: false,
    },
  };
}

function normalizeMapboxBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RoutingProviderConfigurationError(
      "MAPBOX_DIRECTIONS_BASE_URL must be a valid absolute URL.",
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new RoutingProviderConfigurationError(
      "MAPBOX_DIRECTIONS_BASE_URL must not contain credentials, query parameters, or fragments.",
    );
  }
  return url.toString().replace(/\/$/, "");
}

function validateMapboxRouteRequest(request: RouteRequest) {
  assertValidCoordinate(request.origin, "Origin");
  assertValidCoordinate(request.destination, "Destination");
  for (const [index, waypoint] of (request.waypoints ?? []).entries()) {
    assertValidCoordinate(waypoint, `Waypoint ${index + 1}`);
  }
  const coordinateCount = 2 + (request.waypoints?.length ?? 0);
  if (coordinateCount > MAX_MAPBOX_COORDINATES) {
    throw new Error(
      `Mapbox walking routes support at most ${MAX_MAPBOX_COORDINATES} coordinates per request.`,
    );
  }
}

function mapboxHttpError(status: number) {
  if (status === 401 || status === 403) {
    return new RoutingProviderUnauthorizedError(
      "Mapbox routing authorization failed. Check MAPBOX_ACCESS_TOKEN and token restrictions.",
    );
  }
  if (status === 429) {
    return new RoutingProviderRateLimitError("Mapbox routing rate limit exceeded.");
  }
  if (status === 404) {
    return new RoutingProviderConfigurationError(
      "Mapbox walking profile or Directions endpoint was not found.",
    );
  }
  if (status >= 500) {
    return new RoutingProviderUnavailableError(
      `Mapbox routing unavailable with status ${status}.`,
    );
  }
  return new Error(`Mapbox routing request failed with status ${status}.`);
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
    longitude: location[0] as number,
    latitude: location[1] as number,
  };
}
