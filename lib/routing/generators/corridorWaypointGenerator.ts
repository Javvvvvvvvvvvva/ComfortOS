import { along, length as turfLength, lineString } from "@turf/turf";
import type { Coordinate } from "@/lib/geo/types";
import { createLocalProjection } from "@/lib/environment/shade/projection";
import { boundsCenter, boundsForLineString } from "@/lib/environment/buildings/bounds";
import type {
  CandidateGenerationContext,
  CandidateGenerator,
  CandidateWaypointAttempt,
} from "@/lib/routing/generators/types";
import { DEFAULT_CANDIDATE_GENERATION_POLICY } from "@/lib/routing/generators/types";
import type { RouteCandidate, RouteCandidateSet, RouteRequest } from "@/lib/routing/types";
import { RoutingService } from "@/lib/routing/service";

export class CorridorWaypointGenerator implements CandidateGenerator {
  readonly id = "corridor-waypoint" as const;

  constructor(private readonly routingService: RoutingService) {}

  async generateCandidates(
    request: RouteRequest,
    context?: CandidateGenerationContext,
  ): Promise<RouteCandidateSet> {
    const fastestRoute =
      context?.fastestRoute ?? (await this.routingService.getFastestWalkingRoute(request));
    const policy = {
      ...DEFAULT_CANDIDATE_GENERATION_POLICY,
      ...context?.policy,
    };
    const attempts = generateCorridorWaypointAttempts(
      fastestRoute.geometry,
      policy,
    ).slice(0, policy.maxCandidateAttempts);
    const candidates: RouteCandidate[] = [];

    for (const [index, attempt] of attempts.entries()) {
      try {
        const route = await this.routingService.getFastestWalkingRoute({
          ...request,
          waypoints: [attempt.waypoint],
        });
        candidates.push({
          ...route,
          id: `corridor-${index + 1}`,
          sourceRouteIndex: index,
          generation: {
            generator: "corridor-waypoint",
            attemptId: attempt.id,
            waypoint: attempt.waypoint,
          },
        });
      } catch {
        // Unwalkable or unreachable anchors are expected in an experimental generator.
      }
    }

    return {
      candidates,
      provider: fastestRoute.provider,
    };
  }
}

export function generateCorridorWaypointAttempts(
  geometry: RouteCandidate["geometry"],
  policy = DEFAULT_CANDIDATE_GENERATION_POLICY,
): CandidateWaypointAttempt[] {
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
