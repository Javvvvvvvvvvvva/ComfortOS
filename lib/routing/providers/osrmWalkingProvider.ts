import { assertValidCoordinate, isLineStringGeometry } from "@/lib/geo/validation";
import {
  RouteNotFoundError,
  RoutingProviderRateLimitError,
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
  RoutingProviderMode,
  RoutingRequestOptions,
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
  metadata?: Partial<RoutingProviderMetadata>;
  requestTimeoutMs?: number;
  healthCheckRequest?: RouteRequest;
};

export { RouteNotFoundError, RoutingProviderUnavailableError } from "@/lib/routing/errors";

export class OsrmWalkingProvider implements RoutingProvider {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly metadata: RoutingProviderMetadata;
  private readonly requestTimeoutMs: number;
  private readonly healthCheckRequest: RouteRequest;

  constructor(options: OsrmWalkingProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 8_000;
    this.metadata = {
      ...inferOsrmMetadata(this.baseUrl),
      ...options.metadata,
      profile: "foot",
      baseUrl: this.baseUrl,
      endpointFamily: options.metadata?.endpointFamily ?? "OSRM Route API v1",
      productionEligible:
        options.metadata?.productionEligible ??
        inferOsrmMetadata(this.baseUrl).productionEligible,
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
        message: error instanceof Error ? error.message : "Routing provider unavailable.",
      };
    }
  }

  async getWalkingRoute(
    request: RouteRequest,
    options?: RoutingRequestOptions,
  ): Promise<RouteResult> {
    assertValidCoordinate(request.origin, "Origin");
    assertValidCoordinate(request.destination, "Destination");

    const response = await this.fetchRoute(request, false, options);

    if (!response.ok) {
      throw routeHttpError(response.status);
    }

    const payload = (await response.json()) as OsrmRouteResponse;
    return normalizeOsrmRouteResponse(payload, this.metadata);
  }

  async getWalkingRouteCandidates(
    request: RouteRequest,
    options?: RoutingRequestOptions,
  ): Promise<RouteCandidateSet> {
    assertValidCoordinate(request.origin, "Origin");
    assertValidCoordinate(request.destination, "Destination");

    const response = await this.fetchRoute(request, true, options);

    if (!response.ok) {
      throw routeHttpError(response.status);
    }

    const payload = (await response.json()) as OsrmRouteResponse;
    return normalizeOsrmRouteCandidatesResponse(payload, this.metadata);
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
        headers: {
          accept: "application/json",
        },
        signal: requestSignal.signal,
      });
    } catch (error) {
      return requestSignal.classifyError(error, "Routing provider");
    } finally {
      requestSignal.dispose();
    }
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

export function normalizeOsrmRouteResponse(
  payload: OsrmRouteResponse,
  providerMetadata = inferOsrmMetadata("https://routing.openstreetmap.de/routed-foot"),
): RouteResult {
  return normalizeOsrmRouteCandidatesResponse(payload, providerMetadata).candidates[0];
}

export function normalizeOsrmRouteCandidatesResponse(
  payload: OsrmRouteResponse,
  providerMetadata = inferOsrmMetadata("https://routing.openstreetmap.de/routed-foot"),
): RouteCandidateSet {
  if (payload.code !== "Ok") {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : "Routing provider could not calculate a walking route.";
    if (payload.code === "NoRoute") throw new RouteNotFoundError(message);
    throw new RoutingProviderUnavailableError(message);
  }

  if (!Array.isArray(payload.routes) || payload.routes.length === 0) {
    throw new RouteNotFoundError("Routing provider returned no route.");
  }

  const waypointFields = normalizeWaypoints(payload.waypoints);
  const provider = {
    id: providerMetadata.id,
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
        generator: "provider-alternative",
      },
    });
  }

  return {
    candidates,
    provider,
  };
}

export function inferOsrmMetadata(baseUrl: string): RoutingProviderMetadata {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const mode = inferMode(normalizedBaseUrl);
  const publicDemo = mode === "public-demo";
  return {
    id: publicDemo ? "fossgis-osrm-foot" : `osrm-foot-${mode}`,
    name: publicDemo ? "FOSSGIS public OSRM foot demo" : `OSRM foot (${mode})`,
    mode,
    profile: "foot",
    baseUrl: normalizedBaseUrl,
    endpointFamily: "OSRM Route API v1",
    productionEligible: !publicDemo,
    capabilities: {
      alternatives: true,
      waypoints: true,
      maxCoordinates: 100,
      timeDependent: false,
    },
  };
}

function inferMode(baseUrl: string): RoutingProviderMode {
  try {
    const hostname = new URL(baseUrl).hostname;
    if (hostname === "routing.openstreetmap.de" || hostname === "router.project-osrm.org") {
      return "public-demo";
    }
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    ) {
      return "self-hosted";
    }
  } catch {
    return "managed";
  }
  return "managed";
}

function routeHttpError(status: number) {
  if (status === 404) return new RouteNotFoundError("Routing provider found no walking route.");
  if (status === 429) {
    return new RoutingProviderRateLimitError("Routing provider rate limit exceeded.");
  }
  if (status >= 500) {
    return new RoutingProviderUnavailableError(
      `Routing provider unavailable with status ${status}.`,
    );
  }
  return new Error(`Routing request failed with status ${status}.`);
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
