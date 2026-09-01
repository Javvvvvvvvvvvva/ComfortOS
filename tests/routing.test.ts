import assert from "node:assert/strict";
import test from "node:test";
import { formatCoordinate, formatDistance, formatDuration } from "@/lib/geo/format";
import { isValidCoordinate } from "@/lib/geo/validation";
import {
  inferOsrmMetadata,
  normalizeOsrmRouteCandidatesResponse,
  normalizeOsrmRouteResponse,
  RoutingProviderUnavailableError,
} from "@/lib/routing/providers/osrmWalkingProvider";
import { createConfiguredRoutingProvider } from "@/lib/routing/providers/configuredRoutingProvider";
import {
  MapboxWalkingRoutingProvider,
  normalizeMapboxRouteCandidatesResponse,
  normalizeMapboxRouteResponse,
} from "@/lib/routing/providers/mapboxWalkingRoutingProvider";
import {
  RoutingProviderRateLimitError,
  RoutingProviderTimeoutError,
  RoutingProviderUnauthorizedError,
} from "@/lib/routing/errors";
import { deduplicateRouteCandidates } from "@/lib/routing/candidates";
import { RoutingService } from "@/lib/routing/service";
import {
  createRoutingUsageMetrics,
  type RoutingProvider,
} from "@/lib/routing/types";

const MAPBOX_TEST_TOKEN = "pk.test.signature";

test("validates coordinate ranges", () => {
  assert.equal(isValidCoordinate({ latitude: 44.98, longitude: -93.27 }), true);
  assert.equal(isValidCoordinate({ latitude: 91, longitude: -93.27 }), false);
  assert.equal(isValidCoordinate({ latitude: 44.98, longitude: -181 }), false);
});

test("formats route distance, duration, and selected coordinates", () => {
  assert.equal(formatDistance(2414), "1.5 mi");
  assert.equal(formatDistance(-1), "Unavailable");
  assert.equal(formatDuration(780), "13 min");
  assert.equal(formatDuration(3660), "1 hr 1 min");
  assert.equal(
    formatCoordinate({ latitude: 44.977753, longitude: -93.265011 }),
    "44.97775, -93.26501",
  );
});

test("normalizes an OSRM route response", () => {
  const result = normalizeOsrmRouteResponse({
    code: "Ok",
    data_version: "2026-08-07T00:00:00Z",
    routes: [
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-93.265, 44.9778],
            [-93.268, 44.98],
          ],
        },
        distance: 806.4,
        duration: 612,
      },
    ],
    waypoints: [
      { location: [-93.2651, 44.9779] },
      { location: [-93.2682, 44.9801] },
    ],
  });

  assert.equal(result.distanceMeters, 806.4);
  assert.equal(result.durationSeconds, 612);
  assert.equal(result.snappedOrigin?.latitude, 44.9779);
  assert.equal(result.snappedDestination?.longitude, -93.2682);
  assert.equal(result.provider?.id, "fossgis-osrm-foot");
  assert.equal(result.geometry.coordinates.length, 2);
});

test("classifies FOSSGIS OSRM as public demo metadata", () => {
  const metadata = inferOsrmMetadata("https://routing.openstreetmap.de/routed-foot");

  assert.equal(metadata.id, "fossgis-osrm-foot");
  assert.equal(metadata.mode, "public-demo");
  assert.equal(metadata.productionEligible, false);
});

test("configured routing provider rejects public demo in production", () => {
  assert.throws(
    () =>
      createConfiguredRoutingProvider({
        NODE_ENV: "production",
        ROUTING_PROVIDER: "osrm-public",
      }),
    /Public OSRM demo routing is not production eligible/,
  );
});

test("configured routing provider requires explicit self-hosted URL", () => {
  assert.throws(
    () =>
      createConfiguredRoutingProvider({
        NODE_ENV: "test",
        ROUTING_PROVIDER: "osrm-self-hosted",
      }),
    /requires ROUTING_OSRM_BASE_URL/,
  );
});

test("configured self-hosted provider exposes production eligible metadata", () => {
  const { metadata } = createConfiguredRoutingProvider({
    NODE_ENV: "production",
    ROUTING_PROVIDER: "osrm-self-hosted",
    ROUTING_OSRM_BASE_URL: "http://127.0.0.1:5001",
  });

  assert.equal(metadata.mode, "self-hosted");
  assert.equal(metadata.productionEligible, true);
  assert.equal(metadata.baseUrl, "http://127.0.0.1:5001");
});

test("configured Mapbox provider rejects missing or invalid credentials", () => {
  assert.throws(
    () =>
      createConfiguredRoutingProvider({
        NODE_ENV: "test",
        ROUTING_PROVIDER: "mapbox-managed",
      }),
    /MAPBOX_ACCESS_TOKEN is missing or invalid/,
  );
  assert.throws(
    () =>
      createConfiguredRoutingProvider({
        NODE_ENV: "test",
        ROUTING_PROVIDER: "mapbox-managed",
        MAPBOX_ACCESS_TOKEN: "not-a-mapbox-token",
      }),
    /MAPBOX_ACCESS_TOKEN is missing or invalid/,
  );
});

test("configured Mapbox provider is production eligible without exposing its token", () => {
  const { metadata, mode } = createConfiguredRoutingProvider({
    NODE_ENV: "production",
    ROUTING_PROVIDER: "mapbox-managed",
    MAPBOX_ACCESS_TOKEN: MAPBOX_TEST_TOKEN,
  });

  assert.equal(mode, "mapbox-managed");
  assert.equal(metadata.name, "Mapbox");
  assert.equal(metadata.mode, "managed");
  assert.equal(metadata.profile, "walking");
  assert.equal(metadata.endpointFamily, "Directions API v5");
  assert.equal(metadata.productionEligible, true);
  assert.equal(JSON.stringify(metadata).includes(MAPBOX_TEST_TOKEN), false);
});

test("normalizes Mapbox walking routes and alternatives", () => {
  const payload = mapboxResponse();
  const route = normalizeMapboxRouteResponse(payload);
  const candidates = normalizeMapboxRouteCandidatesResponse({
    ...payload,
    routes: [
      ...(payload.routes as object[]),
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-93.265, 44.9778],
            [-93.264, 44.9805],
            [-93.263, 44.981],
          ],
        },
        distance: 510.2,
        duration: 410.5,
        waypoints: [
          { location: [-93.2651, 44.9779] },
          { location: [-93.2631, 44.9811] },
        ],
      },
    ],
  });

  assert.equal(route.distanceMeters, 480.2);
  assert.equal(route.durationSeconds, 388.5);
  assert.equal(route.snappedOrigin?.longitude, -93.2651);
  assert.equal(route.snappedDestination?.latitude, 44.9811);
  assert.equal(route.provider?.id, "mapbox-directions-walking");
  assert.equal(candidates.candidates.length, 2);
  assert.equal(candidates.candidates[1].id, "mapbox-2");
  assert.equal(candidates.candidates[1].generation?.generator, "provider-alternative");
});

test("constructs Mapbox walking and waypoint requests without leaking vendor types", async () => {
  let requestedUrl = "";
  const provider = new MapboxWalkingRoutingProvider({
    accessToken: MAPBOX_TEST_TOKEN,
    walkwayBias: 0.4,
    fetcher: (async (input) => {
      requestedUrl = String(input);
      return jsonResponse(mapboxResponse());
    }) as typeof fetch,
  });

  await provider.getWalkingRouteCandidates({
    origin: { latitude: 44.9778, longitude: -93.265 },
    waypoints: [{ latitude: 44.979, longitude: -93.264 }],
    destination: { latitude: 44.981, longitude: -93.263 },
    departureTime: "2026-08-16T18:00:00.000Z",
  });

  const url = new URL(requestedUrl);
  assert.ok(url.pathname.includes("/directions/v5/mapbox/walking/"));
  assert.ok(url.pathname.includes("-93.265,44.9778;-93.264,44.979;-93.263,44.981"));
  assert.equal(url.searchParams.get("alternatives"), "true");
  assert.equal(url.searchParams.get("geometries"), "geojson");
  assert.equal(url.searchParams.get("waypoints_per_route"), "true");
  assert.equal(url.searchParams.get("walkway_bias"), "0.4");
  assert.equal(url.searchParams.get("depart_at"), null);
  assert.equal(url.searchParams.get("access_token"), MAPBOX_TEST_TOKEN);
});

test("rejects Mapbox requests beyond the documented coordinate limit", async () => {
  const provider = new MapboxWalkingRoutingProvider({
    accessToken: MAPBOX_TEST_TOKEN,
    fetcher: (async () => jsonResponse(mapboxResponse())) as typeof fetch,
  });

  await assert.rejects(
    provider.getWalkingRoute({
      origin: { latitude: 44.9778, longitude: -93.265 },
      waypoints: Array.from({ length: 24 }, (_, index) => ({
        latitude: 44.978 + index * 0.00001,
        longitude: -93.264,
      })),
      destination: { latitude: 44.981, longitude: -93.263 },
      departureTime: "2026-08-16T18:00:00.000Z",
    }),
    /at most 25 coordinates/,
  );
});

test("Mapbox health is normalized and does not expose credentials", async () => {
  const provider = new MapboxWalkingRoutingProvider({
    accessToken: MAPBOX_TEST_TOKEN,
    fetcher: (async () => jsonResponse(mapboxResponse())) as typeof fetch,
  });
  const health = await provider.checkHealth();

  assert.equal(health.ok, true);
  assert.equal(health.status, "ready");
  assert.equal(health.provider.mode, "managed");
  assert.equal(JSON.stringify(health).includes(MAPBOX_TEST_TOKEN), false);
});

test("classifies Mapbox authorization, rate-limit, and server failures", async () => {
  await assert.rejects(mapboxProviderWithStatus(401).getWalkingRoute(validRequest()),
    RoutingProviderUnauthorizedError);
  await assert.rejects(mapboxProviderWithStatus(429).getWalkingRoute(validRequest()),
    RoutingProviderRateLimitError);
  await assert.rejects(mapboxProviderWithStatus(503).getWalkingRoute(validRequest()),
    RoutingProviderUnavailableError);
});

test("classifies Mapbox timeout separately from caller cancellation", async () => {
  const provider = new MapboxWalkingRoutingProvider({
    accessToken: MAPBOX_TEST_TOKEN,
    requestTimeoutMs: 5,
    fetcher: abortingFetcher(),
  });
  await assert.rejects(provider.getWalkingRoute(validRequest()), RoutingProviderTimeoutError);

  const controller = new AbortController();
  const cancelledProvider = new MapboxWalkingRoutingProvider({
    accessToken: MAPBOX_TEST_TOKEN,
    requestTimeoutMs: 5_000,
    fetcher: abortingFetcher(),
  });
  const pending = cancelledProvider.getWalkingRoute(validRequest(), {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, (error: unknown) => {
    assert.ok(error instanceof Error);
    return error.name === "AbortError";
  });
});

test("routing usage metrics distinguish fastest and candidate provider calls", async () => {
  const metrics = createRoutingUsageMetrics();
  const service = new RoutingService({
    async getWalkingRoute() {
      return normalizeMapboxRouteResponse(mapboxResponse());
    },
    async getWalkingRouteCandidates() {
      throw new RoutingProviderUnavailableError("candidate request failed");
    },
  });

  await service.getFastestWalkingRoute(validRequest(), { usageMetrics: metrics });
  await assert.rejects(
    service.getWalkingRouteCandidates(validRequest(), { usageMetrics: metrics }),
  );
  assert.deepEqual(metrics, {
    fastestRequests: 1,
    candidateRequests: 1,
    failedRequests: 1,
    totalRequests: 2,
  });
});

test("normalizes OSRM alternative route candidates", () => {
  const result = normalizeOsrmRouteCandidatesResponse({
    code: "Ok",
    routes: [
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-93.265, 44.9778],
            [-93.268, 44.98],
          ],
        },
        distance: 806.4,
        duration: 612,
      },
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-93.265, 44.9778],
            [-93.266, 44.979],
            [-93.268, 44.98],
          ],
        },
        distance: 884,
        duration: 702,
      },
    ],
  });

  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].id, "osrm-1");
  assert.equal(result.candidates[1].sourceRouteIndex, 1);
});

test("deduplicates nearly identical route candidates", () => {
  const candidates = normalizeOsrmRouteCandidatesResponse({
    code: "Ok",
    routes: [
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-93.265, 44.9778],
            [-93.266, 44.9788],
            [-93.268, 44.98],
          ],
        },
        distance: 800,
        duration: 600,
      },
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-93.26501, 44.97781],
            [-93.26601, 44.97881],
            [-93.26801, 44.98001],
          ],
        },
        distance: 802,
        duration: 606,
      },
    ],
  }).candidates;

  assert.equal(deduplicateRouteCandidates(candidates).length, 1);
});

test("rejects malformed provider output", () => {
  assert.throws(
    () =>
      normalizeOsrmRouteResponse({
        code: "Ok",
        routes: [{ geometry: { type: "Point", coordinates: [-93.2, 44.9] } }],
      }),
    /malformed route geometry|malformed distance/,
  );
});

test("normalizes OSRM provider errors by availability versus no-route", () => {
  assert.throws(
    () =>
      normalizeOsrmRouteResponse({
        code: "NoRoute",
        message: "No route found.",
      }),
    /No route found/,
  );

  assert.throws(
    () =>
      normalizeOsrmRouteResponse({
        code: "Error",
        message: "Backend unavailable.",
      }),
    RoutingProviderUnavailableError,
  );
});

test("routing service requires a departure time from the start", async () => {
  const provider: RoutingProvider = {
    async getWalkingRoute() {
      throw new Error("Provider should not be called for invalid requests.");
    },
  };
  const service = new RoutingService(provider);

  await assert.rejects(
    service.getFastestWalkingRoute({
      origin: { latitude: 44.98, longitude: -93.27 },
      destination: { latitude: 44.99, longitude: -93.26 },
      departureTime: "",
    }),
    /Departure time/,
  );
});

function validRequest() {
  return {
    origin: { latitude: 44.9778, longitude: -93.265 },
    destination: { latitude: 44.981, longitude: -93.263 },
    departureTime: "2026-08-16T18:00:00.000Z",
  };
}

function mapboxResponse() {
  return {
    code: "Ok",
    routes: [
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-93.265, 44.9778],
            [-93.264, 44.979],
            [-93.263, 44.981],
          ],
        },
        distance: 480.2,
        duration: 388.5,
        waypoints: [
          { location: [-93.2651, 44.9779] },
          { location: [-93.2631, 44.9811] },
        ],
      },
    ],
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mapboxProviderWithStatus(status: number) {
  return new MapboxWalkingRoutingProvider({
    accessToken: MAPBOX_TEST_TOKEN,
    fetcher: (async () => jsonResponse({ message: "vendor error" }, status)) as typeof fetch,
  });
}

function abortingFetcher() {
  return ((_: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort, { once: true });
    })) as typeof fetch;
}
