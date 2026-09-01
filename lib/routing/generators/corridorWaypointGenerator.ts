import { along, length as turfLength, lineString } from "@turf/turf";
import type { Coordinate } from "@/lib/geo/types";
import { createLocalProjection } from "@/lib/environment/shade/projection";
import { boundsCenter, boundsForLineString } from "@/lib/environment/buildings/bounds";
import { calculateCandidateDiversity } from "@/lib/routing/candidates";
import type {
  CandidateGenerationContext,
  CandidateGenerator,
  CandidateWaypointAttempt,
} from "@/lib/routing/generators/types";
import { DEFAULT_CANDIDATE_GENERATION_POLICY } from "@/lib/routing/generators/types";
import type {
  RouteCandidate,
  RouteCandidateSet,
  RouteRequest,
  RouteResult,
} from "@/lib/routing/types";
import { RoutingService } from "@/lib/routing/service";

export class CorridorWaypointGenerator implements CandidateGenerator {
  readonly id = "corridor-waypoint" as const;

  constructor(private readonly routingService: RoutingService) {}

  async generateCandidates(
    request: RouteRequest,
    context?: CandidateGenerationContext,
  ): Promise<RouteCandidateSet> {
    const fastestRoute =
      context?.fastestRoute ??
      (await this.routingService.getFastestWalkingRoute(request, {
        signal: context?.signal,
        usageCategory: "fastest",
        usageMetrics: context?.usageMetrics,
      }));
    const policy = {
      ...DEFAULT_CANDIDATE_GENERATION_POLICY,
      ...context?.policy,
    };
    const maxCandidateAttempts = resolveAdaptiveCandidateAttemptLimit(
      fastestRoute.distanceMeters,
      policy,
    );
    const attempts = generateCorridorWaypointAttempts(
      fastestRoute.geometry,
      policy,
    ).slice(0, maxCandidateAttempts);
    const routeCache = new Map<string, Promise<RouteCandidate | RouteResult>>();
    const candidates = await runBoundedAttemptQueue({
      attempts,
      maxConcurrency: policy.maxConcurrentCandidateRequests,
      signal: context?.signal,
      earlyStopDiverseCandidateCount: policy.earlyStopDiverseCandidateCount,
      isDiverse: (candidate) =>
        calculateCandidateDiversity(candidate, fastestRoute).uniqueMeters >=
        policy.minUniqueMeters,
      routeAttempt: async (attempt, index) => {
        const routeRequest = {
          ...request,
          waypoints: [attempt.waypoint],
        };
        const cacheKey = routeRequestCacheKey(routeRequest);
        const routePromise =
          routeCache.get(cacheKey) ??
          this.routingService.getFastestWalkingRoute(routeRequest, {
            signal: context?.signal,
            usageCategory: "candidate",
            usageMetrics: context?.usageMetrics,
          });
        routeCache.set(cacheKey, routePromise);
        const route = await routePromise;

        return {
          ...route,
          id: `corridor-${index + 1}`,
          sourceRouteIndex: index,
          generation: {
            generator: "corridor-waypoint",
            attemptId: attempt.id,
            waypoint: attempt.waypoint,
          },
        };
      },
    });

    return {
      candidates,
      provider: fastestRoute.provider ?? candidates.find((candidate) => candidate.provider)?.provider,
    };
  }
}

export function routeRequestCacheKey(request: RouteRequest) {
  return [
    coordinateKey(request.origin),
    ...(request.waypoints ?? []).map(coordinateKey),
    coordinateKey(request.destination),
    "walking",
  ].join("|");
}

export function resolveAdaptiveCandidateAttemptLimit(
  fastestDistanceMeters: number,
  policy = DEFAULT_CANDIDATE_GENERATION_POLICY,
) {
  if (!policy.adaptiveAttempts) return policy.maxCandidateAttempts;
  if (!Number.isFinite(fastestDistanceMeters) || fastestDistanceMeters <= 0) {
    return policy.maxCandidateAttempts;
  }

  if (fastestDistanceMeters < 700) return Math.min(policy.maxCandidateAttempts, 2);
  if (fastestDistanceMeters < 1600) return Math.min(policy.maxCandidateAttempts, 3);
  return policy.maxCandidateAttempts;
}

async function runBoundedAttemptQueue({
  attempts,
  maxConcurrency,
  signal,
  earlyStopDiverseCandidateCount,
  isDiverse,
  routeAttempt,
}: {
  attempts: CandidateWaypointAttempt[];
  maxConcurrency: number;
  signal?: AbortSignal;
  earlyStopDiverseCandidateCount: number;
  isDiverse: (candidate: RouteCandidate) => boolean;
  routeAttempt: (attempt: CandidateWaypointAttempt, index: number) => Promise<RouteCandidate>;
}) {
  const candidates: RouteCandidate[] = [];
  const boundedConcurrency = Math.max(1, Math.floor(maxConcurrency));
  let nextIndex = 0;
  let diverseCount = 0;

  async function worker() {
    while (!signal?.aborted) {
      if (diverseCount >= earlyStopDiverseCandidateCount) return;
      const index = nextIndex;
      nextIndex += 1;
      const attempt = attempts[index];
      if (!attempt) return;

      try {
        const candidate = await routeAttempt(attempt, index);
        candidates.push(candidate);
        if (isDiverse(candidate)) diverseCount += 1;
      } catch (error) {
        if (signal?.aborted) throw error;
        // Unwalkable or unreachable anchors are expected in an experimental generator.
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(boundedConcurrency, attempts.length) }, () => worker()),
  );

  return candidates.sort((left, right) => left.sourceRouteIndex - right.sourceRouteIndex);
}

export function generateCorridorWaypointAttempts(
  geometry: RouteCandidate["geometry"],
  policyInput: Partial<typeof DEFAULT_CANDIDATE_GENERATION_POLICY> = DEFAULT_CANDIDATE_GENERATION_POLICY,
): CandidateWaypointAttempt[] {
  const policy = {
    ...DEFAULT_CANDIDATE_GENERATION_POLICY,
    ...policyInput,
  };
  if (geometry.coordinates.length < 2) return [];

  const routeLine = lineString(geometry.coordinates);
  const totalMeters = turfLength(routeLine, { units: "kilometers" }) * 1000;
  if (!Number.isFinite(totalMeters) || totalMeters <= 0) return [];

  const projection = createLocalProjection(boundsCenter(boundsForLineString(geometry, 0)));
  const attempts: CandidateWaypointAttempt[] = [];

  for (const ratio of policy.routeSampleRatios) {
    const center = coordinateAtMeters(routeLine, totalMeters * ratio);
    const before = coordinateAtMeters(routeLine, totalMeters * Math.max(0, ratio - 0.02));
    const after = coordinateAtMeters(routeLine, totalMeters * Math.min(1, ratio + 0.02));
    const centerPoint = projection.project(center);
    const beforePoint = projection.project(before);
    const afterPoint = projection.project(after);
    const tangent = normalize([
      afterPoint[0] - beforePoint[0],
      afterPoint[1] - beforePoint[1],
    ]);
    if (!tangent) continue;

    const normal = [-tangent[1], tangent[0]] as [number, number];

    for (const offsetMeters of policy.offsetDistancesMeters) {
      if (offsetMeters > policy.corridorWidthMeters) continue;

      for (const side of ["left", "right"] as const) {
        const direction = side === "left" ? 1 : -1;
        const waypoint = projection.unproject([
          centerPoint[0] + normal[0] * offsetMeters * direction,
          centerPoint[1] + normal[1] * offsetMeters * direction,
        ]);
        attempts.push({
          id: `${Math.round(ratio * 100)}-${side}-${offsetMeters}`,
          waypoint,
          sampleRatio: ratio,
          offsetMeters,
          side,
        });
      }
    }
  }

  return attempts;
}

function coordinateAtMeters(
  routeLine: ReturnType<typeof lineString>,
  distanceMeters: number,
): Coordinate {
  const coordinate = along(routeLine, distanceMeters / 1000, {
    units: "kilometers",
  }).geometry.coordinates as [number, number];

  return {
    longitude: coordinate[0],
    latitude: coordinate[1],
  };
}

function normalize(vector: [number, number]): [number, number] | null {
  const magnitude = Math.hypot(vector[0], vector[1]);
  if (!Number.isFinite(magnitude) || magnitude <= 0) return null;
  return [vector[0] / magnitude, vector[1] / magnitude];
}

function coordinateKey(coordinate: Coordinate) {
  return `${coordinate.longitude.toFixed(6)},${coordinate.latitude.toFixed(6)}`;
}
