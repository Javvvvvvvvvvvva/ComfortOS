import assert from "node:assert/strict";
import test from "node:test";
import { ComfortAnalysisService } from "@/lib/comfort/service";
import { ComfortRouteComparisonService } from "@/lib/comfort-routing/service";
import type { BuildingProvider } from "@/lib/environment/buildings/types";
import type { ShadeAnalysisService } from "@/lib/environment/shade/service";
import type { ShadeAnalysisRequest } from "@/lib/environment/shade/types";
import type { WindAnalysisService } from "@/lib/environment/wind/windService";
import type { WindAnalysisRequest } from "@/lib/environment/wind/types";
import { calculateCandidateDiversity } from "@/lib/routing/candidates";
import {
  CorridorWaypointGenerator,
  generateCorridorWaypointAttempts,
  resolveAdaptiveCandidateAttemptLimit,
  routeRequestCacheKey,
} from "@/lib/routing/generators/corridorWaypointGenerator";
import { CompositeCandidateGenerator } from "@/lib/routing/generators/compositeCandidateGenerator";
import { ProviderAlternativeGenerator } from "@/lib/routing/generators/providerAlternativeGenerator";
import { MapboxWalkingRoutingProvider } from "@/lib/routing/providers/mapboxWalkingRoutingProvider";
import { RoutingService } from "@/lib/routing/service";
import type { RouteCandidate, RouteRequest, RoutingProvider } from "@/lib/routing/types";
import type { WeatherService } from "@/lib/weather/service";

const request: RouteRequest = {
  origin: { latitude: 44.98, longitude: -93.27 },
  destination: { latitude: 44.99, longitude: -93.25 },
  departureTime: "2026-08-10T18:00:00.000Z",
};

test("corridor waypoint attempts use meter offsets around route geometry", () => {
  const attempts = generateCorridorWaypointAttempts(fastestRoute.geometry, {
    corridorWidthMeters: 200,
    offsetDistancesMeters: [100],
    routeSampleRatios: [0.5],
    maxCandidateAttempts: 2,
    maxEnvironmentAnalyzedCandidates: 4,
    minUniqueMeters: 20,
    maxPreAnalysisDurationRatio: 0.45,
    maxPreAnalysisDistanceRatio: 0.45,
  });

  assert.equal(attempts.length, 2);
  assert.notEqual(attempts[0].waypoint.longitude, attempts[1].waypoint.longitude);
  assert.ok(Math.abs(attempts[0].waypoint.latitude - 44.985) < 0.01);
});

test("corridor waypoint generator normalizes routed waypoint candidates and tolerates waypoint failures", async () => {
  const routingService = new RoutingService(fakeProvider({ failWaypointLongitudeBelow: -93.265 }));
  const generator = new CorridorWaypointGenerator(routingService);
  const result = await generator.generateCandidates(request, {
    fastestRoute,
    policy: {
      offsetDistancesMeters: [120],
      routeSampleRatios: [0.5],
      maxCandidateAttempts: 2,
    },
  });

  assert.ok(result.candidates.length >= 1);
  assert.ok(result.candidates.length <= 2);
  assert.equal(result.candidates[0].generation?.generator, "corridor-waypoint");
  assert.ok(result.candidates[0].generation?.waypoint);
});

test("corridor waypoint generator respects bounded concurrency", async () => {
  const provider = concurrentProvider();
  const routingService = new RoutingService(provider);
  const generator = new CorridorWaypointGenerator(routingService);

  await generator.generateCandidates(request, {
    fastestRoute,
    policy: {
      offsetDistancesMeters: [80, 120],
      routeSampleRatios: [0.33, 0.5, 0.67],
      maxCandidateAttempts: 6,
      maxConcurrentCandidateRequests: 2,
    },
  });

  assert.ok(provider.maxObservedConcurrentCalls <= 2);
});

test("corridor waypoint generation remains compatible with normalized Mapbox walking routes", async () => {
  let calls = 0;
  const provider = new MapboxWalkingRoutingProvider({
    accessToken: "pk.test.signature",
    fetcher: (async (input) => {
      calls += 1;
      const url = new URL(String(input));
      const coordinates = decodeURIComponent(url.pathname.split("/walking/")[1])
        .split(";")
        .map((value) => value.split(",").map(Number) as [number, number]);
      return new Response(
        JSON.stringify({
          code: "Ok",
          routes: [
            {
              geometry: { type: "LineString", coordinates },
              distance: 980,
              duration: 660,
            },
          ],
          waypoints: coordinates.map((location) => ({ location })),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch,
  });
  const generator = new CorridorWaypointGenerator(new RoutingService(provider));

  const result = await generator.generateCandidates(request, {
    fastestRoute,
    policy: {
      offsetDistancesMeters: [120],
      routeSampleRatios: [0.5],
      maxCandidateAttempts: 2,
      maxConcurrentCandidateRequests: 2,
    },
  });

  assert.equal(result.candidates.length, 2);
  assert.equal(calls, 2);
  assert.equal(result.provider?.id, "mapbox-directions-walking");
  assert.equal(result.candidates[0].generation?.generator, "corridor-waypoint");
});

test("adaptive candidate attempt policy is distance based and capped", () => {
  assert.equal(resolveAdaptiveCandidateAttemptLimit(500, adaptivePolicy(4)), 2);
  assert.equal(resolveAdaptiveCandidateAttemptLimit(1200, adaptivePolicy(4)), 3);
  assert.equal(resolveAdaptiveCandidateAttemptLimit(2400, adaptivePolicy(4)), 4);
});

test("candidate route cache key includes origin destination waypoint and profile", () => {
  const withWaypoint = routeRequestCacheKey({
    ...request,
    waypoints: [{ latitude: 44.98123456, longitude: -93.26123456 }],
  });
  const withoutWaypoint = routeRequestCacheKey(request);

  assert.notEqual(withWaypoint, withoutWaypoint);
  assert.ok(withWaypoint.includes("-93.261235,44.981235"));
  assert.ok(withWaypoint.endsWith("|walking"));
});

test("corridor waypoint generator can early-stop after enough diverse candidates", async () => {
  const provider = concurrentProvider();
  const routingService = new RoutingService(provider);
  const generator = new CorridorWaypointGenerator(routingService);

  const result = await generator.generateCandidates(request, {
    fastestRoute,
    policy: {
      offsetDistancesMeters: [80, 120],
      routeSampleRatios: [0.33, 0.5, 0.67],
      maxCandidateAttempts: 6,
      maxConcurrentCandidateRequests: 1,
      earlyStopDiverseCandidateCount: 2,
      minUniqueMeters: 1,
    },
  });

  assert.equal(result.candidates.length, 2);
  assert.equal(provider.calls, 2);
});

test("composite generator can run provider-alternatives-only baseline mode", async () => {
  const routingService = new RoutingService(fakeProvider());
  const generator = new CompositeCandidateGenerator([
    new ProviderAlternativeGenerator(routingService),
    new CorridorWaypointGenerator(routingService),
  ]);
  const result = await generator.generateCandidates(
    { ...request, generationMode: "provider-only" } as RouteRequest,
    { fastestRoute },
  );

  assert.equal(
    result.candidates.every(
      (candidate) => candidate.generation?.generator === "provider-alternative",
    ),
    true,
  );
});

test("candidate diversity reports unique meters and lateral separation", () => {
  const diversity = calculateCandidateDiversity(offsetCandidate, fastestRoute);

  assert.ok(diversity.uniqueMeters > 0);
  assert.ok(diversity.maxLateralSeparationMeters > 50);
});

test("comparison service prefilters and bounds environment-analyzed candidate count", async () => {
  const buildingProvider = countingBuildingProvider();
  const comparison = await makeComparisonService(buildingProvider).compareWalkingRoutes({
    ...request,
    generationPolicy: {
      maxEnvironmentAnalyzedCandidates: 2,
      minUniqueMeters: 20,
    },
  });

  assert.equal(comparison.debug.generation?.environmentAnalyzedCandidates, 2);
  assert.ok((comparison.debug.generation?.generatedCandidates ?? 0) > 2);
});

test("comparison service reuses one shared building fetch across candidate shade and wind analysis", async () => {
  const buildingProvider = countingBuildingProvider();
  await makeComparisonService(buildingProvider).compareWalkingRoutes({
    ...request,
    generationPolicy: {
      maxEnvironmentAnalyzedCandidates: 3,
      minUniqueMeters: 20,
    },
  });

  assert.equal(buildingProvider.calls, 1);
});

test("comparison service returns partial candidates when shared building fetch fails", async () => {
  const buildingProvider = failingBuildingProvider();
  const comparison = await makeComparisonService(buildingProvider).compareWalkingRoutes({
    ...request,
    generationPolicy: {
      maxEnvironmentAnalyzedCandidates: 2,
      minUniqueMeters: 20,
    },
  });

  assert.equal(buildingProvider.calls, 1);
  assert.equal(comparison.candidates.length, 2);
  assert.equal(comparison.fastest.status, "partial");
  assert.equal(comparison.fastest.comfortAnalysis?.routeComfortCost.comparable, false);
});

const fastestRoute: RouteCandidate = {
  id: "fastest",
  sourceRouteIndex: 0,
  durationSeconds: 600,
  distanceMeters: 900,
  geometry: {
    type: "LineString",
    coordinates: [
      [-93.27, 44.98],
      [-93.26, 44.985],
      [-93.25, 44.99],
    ],
  },
  generation: { generator: "provider-alternative" },
};

const offsetCandidate: RouteCandidate = {
  ...fastestRoute,
  id: "offset",
  distanceMeters: 980,
  durationSeconds: 660,
  geometry: {
    type: "LineString",
    coordinates: [
      [-93.27, 44.98],
      [-93.265, 44.989],
      [-93.25, 44.99],
    ],
  },
  generation: { generator: "corridor-waypoint" },
};

function fakeProvider(options: { failWaypointLongitudeBelow?: number } = {}): RoutingProvider {
  return {
    async getWalkingRoute(routeRequest) {
      const waypoint = routeRequest.waypoints?.[0];
      if (
        waypoint &&
        options.failWaypointLongitudeBelow !== undefined &&
        waypoint.longitude < options.failWaypointLongitudeBelow
      ) {
        throw new Error("Unwalkable waypoint.");
      }

      return waypoint
        ? {
            ...offsetCandidate,
            geometry: {
              type: "LineString",
              coordinates: [
                [routeRequest.origin.longitude, routeRequest.origin.latitude],
                [waypoint.longitude, waypoint.latitude],
                [routeRequest.destination.longitude, routeRequest.destination.latitude],
              ],
            },
          }
        : fastestRoute;
    },
    async getWalkingRouteCandidates() {
      return {
        candidates: [fastestRoute, offsetCandidate, { ...offsetCandidate, id: "wide" }],
      };
    },
  };
}

function concurrentProvider(): RoutingProvider & {
  calls: number;
  activeCalls: number;
  maxObservedConcurrentCalls: number;
} {
  return {
    calls: 0,
    activeCalls: 0,
    maxObservedConcurrentCalls: 0,
    async getWalkingRoute(routeRequest) {
      this.calls += 1;
      this.activeCalls += 1;
      this.maxObservedConcurrentCalls = Math.max(
        this.maxObservedConcurrentCalls,
        this.activeCalls,
      );
      await new Promise((resolve) => setTimeout(resolve, 1));
      this.activeCalls -= 1;
      const waypoint = routeRequest.waypoints?.[0];

      return waypoint
        ? {
            ...offsetCandidate,
            geometry: {
              type: "LineString",
              coordinates: [
                [routeRequest.origin.longitude, routeRequest.origin.latitude],
                [waypoint.longitude, waypoint.latitude],
                [routeRequest.destination.longitude, routeRequest.destination.latitude],
              ],
            },
          }
        : fastestRoute;
    },
  };
}

function adaptivePolicy(maxCandidateAttempts: number) {
  return {
    corridorWidthMeters: 260,
    offsetDistancesMeters: [120, 220],
    routeSampleRatios: [0.5, 0.33, 0.67],
    maxCandidateAttempts,
    maxConcurrentCandidateRequests: 1,
    earlyStopDiverseCandidateCount: Number.POSITIVE_INFINITY,
    adaptiveAttempts: true,
    maxEnvironmentAnalyzedCandidates: 5,
    minUniqueMeters: 40,
    maxPreAnalysisDurationRatio: 0.45,
    maxPreAnalysisDistanceRatio: 0.45,
  };
}

function countingBuildingProvider(): BuildingProvider & { calls: number } {
  return {
    calls: 0,
    async getBuildings() {
      this.calls += 1;
      return [];
    },
  };
}

function failingBuildingProvider(): BuildingProvider & { calls: number } {
  return {
    calls: 0,
    async getBuildings() {
      this.calls += 1;
      throw new Error("Building data unavailable.");
    },
  };
}

function makeComparisonService(buildingProvider: BuildingProvider) {
  const routingService = new RoutingService(fakeProvider());
  const candidateGenerator = new CompositeCandidateGenerator([
    new ProviderAlternativeGenerator(routingService),
    new CorridorWaypointGenerator(routingService),
  ]);

  return new ComfortRouteComparisonService(
    routingService,
    candidateGenerator,
    {
      async getWeatherBundle() {
        return {
          coordinate: request.origin,
          current: {
            timestamp: request.departureTime,
            temperatureC: 0,
            relativeHumidity: 50,
            windSpeedMps: 3,
            windDirectionDeg: 315,
            source: "fixture",
            confidence: 1,
          },
          hourlyForecast: [],
          alerts: [],
          source: "fixture",
          updatedAt: request.departureTime,
        };
      },
    } as unknown as WeatherService,
    buildingProvider,
    {
      async analyzeRouteShade(shadeRequest: ShadeAnalysisRequest) {
        return {
          status: "available",
          routeGeometry: shadeRequest.route.geometry,
          departureTime: shadeRequest.departureTime,
          solarPosition: {
            azimuthDeg: 180,
            elevationDeg: 30,
            timestamp: shadeRequest.departureTime,
            sunAboveHorizon: true,
          },
          segments: [],
          segmentShade: [],
          summary: {
            shadeRatio: (shadeRequest.route as RouteCandidate).id === "offset" ? 0.1 : 0.6,
            shadedMeters: 0,
            exposedMeters: shadeRequest.route.distanceMeters,
            analyzedMeters: shadeRequest.route.distanceMeters,
            unknownMeters: 0,
            confidence: 1,
          },
          coverage: {
            routeMeters: shadeRequest.route.distanceMeters,
            analyzedMeters: shadeRequest.route.distanceMeters,
            unknownMeters: 0,
            buildingCount: 0,
            usableBuildingCount: 0,
            explicitHeightBuildingCount: 0,
            floorDerivedHeightBuildingCount: 0,
            unknownHeightBuildingCount: 0,
          },
          quality: {
            geometryCoverage: 1,
            heightCoverage: 1,
            explicitHeightCoverage: 1,
            derivedHeightCoverage: 0,
            routeAnalysisCoverage: 1,
            overallConfidence: 1,
          },
        };
      },
    } as unknown as ShadeAnalysisService,
    {
      async analyzeRouteWind(windRequest: WindAnalysisRequest) {
        return {
          status: "available",
          routeGeometry: windRequest.route.geometry,
          departureTime: windRequest.departureTime,
          segments: [],
          segmentWind: [],
          summary: {
            averageEstimatedExposureMps:
              (windRequest.route as RouteCandidate).id === "offset" ? 1 : 3,
            averageHeadwindMps: 0,
            averageCrosswindMps: 1,
            shelteredMeters: 0,
            neutralMeters: windRequest.route.distanceMeters,
            exposedMeters: 0,
            analyzedMeters: windRequest.route.distanceMeters,
            unknownMeters: 0,
            confidence: 1,
          },
          coverage: {
            routeMeters: windRequest.route.distanceMeters,
            analyzedMeters: windRequest.route.distanceMeters,
            unknownMeters: 0,
            shelteredMeters: 0,
            neutralMeters: windRequest.route.distanceMeters,
            exposedMeters: 0,
            buildingCount: 0,
            usableBuildingCount: 0,
            explicitHeightBuildingCount: 0,
            floorDerivedHeightBuildingCount: 0,
            unknownHeightBuildingCount: 0,
          },
          quality: {
            weatherConfidence: 1,
            geometryCoverage: 1,
            heightCoverage: 1,
            shelterModelConfidence: 1,
            routeAnalysisCoverage: 1,
            overallConfidence: 1,
          },
        };
      },
    } as unknown as WindAnalysisService,
    new ComfortAnalysisService(),
  );
}
