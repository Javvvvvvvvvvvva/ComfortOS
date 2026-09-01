import assert from "node:assert/strict";
import test from "node:test";
import type { BuildingProvider } from "@/lib/environment/buildings/types";
import { ShadeAnalysisService } from "@/lib/environment/shade/service";
import { WindAnalysisService } from "@/lib/environment/wind/windService";
import type { Coordinate } from "@/lib/geo/types";
import type { RouteResult } from "@/lib/routing/types";
import type { WeatherBundle } from "@/lib/weather/types";
import { deriveRegionCapabilities } from "@/lib/regions/capabilities";
import { evaluateMvpReadiness } from "@/lib/health/readiness";
import { sanitizeServerLogFields } from "@/lib/observability/serverLog";

const ORIGIN: Coordinate = { latitude: 44.9778, longitude: -93.265 };
const ROUTE: RouteResult = {
  geometry: {
    type: "LineString",
    coordinates: [
      [ORIGIN.longitude, ORIGIN.latitude],
      [ORIGIN.longitude + 0.001, ORIGIN.latitude],
    ],
  },
  distanceMeters: 80,
  durationSeconds: 60,
};
const BUILDINGS: BuildingProvider = {
  async getBuildings() {
    return [];
  },
};
const WEATHER: WeatherBundle = {
  coordinate: ORIGIN,
  current: null,
  hourlyForecast: [
    {
      timestamp: "2026-08-08T18:00:00.000Z",
      windSpeedMps: 4,
      windDirectionDeg: 270,
    },
  ],
  alerts: [],
  source: "fixture",
  updatedAt: "2026-08-08T18:00:00.000Z",
};

test("shade analysis omits debug collections when production comparison disables them", async () => {
  const service = new ShadeAnalysisService(BUILDINGS, 0);
  const result = await service.analyzeRouteShade({
    route: ROUTE,
    departureTime: "2026-08-08T18:00:00.000Z",
    includeDebug: false,
  });

  assert.equal(result.debug, undefined);
  assert.ok(result.segments.length > 0);
});

test("wind analysis omits debug collections when production comparison disables them", async () => {
  const service = new WindAnalysisService(BUILDINGS, undefined, undefined, 0);
  const result = await service.analyzeRouteWind({
    route: ROUTE,
    departureTime: "2026-08-08T18:00:00.000Z",
    weatherBundle: WEATHER,
    includeDebug: false,
  });

  assert.equal(result.debug, undefined);
  assert.ok(result.segments.length > 0);
});

test("standalone environmental analysis retains debug collections by default", async () => {
  const shadeService = new ShadeAnalysisService(BUILDINGS, 0);
  const windService = new WindAnalysisService(BUILDINGS, undefined, undefined, 0);
  const [shade, wind] = await Promise.all([
    shadeService.analyzeRouteShade({
      route: ROUTE,
      departureTime: "2026-08-08T18:00:00.000Z",
    }),
    windService.analyzeRouteWind({
      route: ROUTE,
      departureTime: "2026-08-08T18:00:00.000Z",
      weatherBundle: WEATHER,
    }),
  ]);

  assert.ok(shade.debug);
  assert.ok(wind.debug);
});

test("region capabilities distinguish unsupported, partial, and ready inputs", () => {
  const capabilities = deriveRegionCapabilities({
    routingReady: true,
    weatherAvailable: true,
    buildingsAvailable: false,
    analyzedCandidateCount: 3,
    shadeAvailableCount: 0,
    windAvailableCount: 0,
    rainAvailableCount: 3,
    rainCoverProviderAvailable: true,
    rainCoverConsumerEligible: false,
    heatAvailableCount: 2,
    heatConsumerEligible: false,
  });

  assert.equal(capabilities.routing, "ready");
  assert.equal(capabilities.buildings, "unavailable");
  assert.equal(capabilities.rainCover, "partial");
  assert.equal(capabilities.heat, "partial");
});

test("structured server logs drop secrets and precise location fields", () => {
  const sanitized = sanitizeServerLogFields({
    requestId: "request-1",
    provider: "managed",
    accessToken: "do-not-log",
    latitude: 44.9,
    destination: "do-not-log",
  });

  assert.deepEqual(sanitized, {
    requestId: "request-1",
    provider: "managed",
  });
});

test("readiness reports public demos and local stores as not production ready", () => {
  const readiness = evaluateMvpReadiness({
    NODE_ENV: "development",
    ROUTING_PROVIDER: "mapbox-managed",
    MAPBOX_ACCESS_TOKEN: "pk.test.token",
    WEATHER_USER_AGENT: "ComfortOS Stage 1 (contact: replace-with-project-contact)",
    BUILDING_PROVIDER: "http-overture",
    BUILDING_QUERY_SERVICE_URL: "http://127.0.0.1:8787",
    GEOCODING_BASE_URL: "https://photon.komoot.io",
    NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  });

  assert.equal(readiness.status, "not-ready");
  assert.equal(readiness.subsystems.routing.productionReady, true);
  assert.equal(readiness.subsystems.buildings.productionReady, false);
  assert.equal(readiness.subsystems.geocoding.productionReady, false);
  assert.equal(readiness.subsystems.basemap.productionReady, false);
});

test("readiness accepts configured managed POI geocoding", () => {
  const readiness = evaluateMvpReadiness({
    NODE_ENV: "test",
    GEOCODING_PROVIDER: "mapbox-managed",
    MAPBOX_ACCESS_TOKEN: "pk.test.mapbox-token",
  });

  assert.equal(readiness.subsystems.geocoding.configured, true);
  assert.equal(readiness.subsystems.geocoding.productionReady, true);
  assert.equal(readiness.subsystems.geocoding.mode, "mapbox-managed");
});
