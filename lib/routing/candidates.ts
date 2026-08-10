import {
  along,
  length as turfLength,
  lineString,
  point,
  pointToLineDistance,
} from "@turf/turf";
import type { RouteCandidate } from "@/lib/routing/types";

export const ROUTE_CANDIDATE_DEDUPLICATION = {
  overlapRatioThreshold: 0.92,
  pointPrecisionDecimals: 4,
};

export type DeduplicatedRouteCandidate = RouteCandidate & {
  routeOverlapRatio: number;
  duplicateOfCandidateId?: string;
};

export type CandidateDiversity = {
  overlapWithFastest: number;
  uniqueMeters: number;
  maxLateralSeparationMeters: number;
};

export function deduplicateRouteCandidates(
  candidates: RouteCandidate[],
  options = ROUTE_CANDIDATE_DEDUPLICATION,
): DeduplicatedRouteCandidate[] {
  const accepted: DeduplicatedRouteCandidate[] = [];

  for (const candidate of sortCandidatesByDuration(candidates)) {
    const overlap = accepted.reduce(
      (max, acceptedCandidate) =>
        Math.max(max, calculateRouteOverlapRatio(candidate, acceptedCandidate)),
      0,
    );

    if (overlap >= options.overlapRatioThreshold) {
      continue;
    }

    accepted.push({
      ...candidate,
      routeOverlapRatio: overlap,
    });
  }

  return accepted;
}

export function sortCandidatesByDuration(candidates: RouteCandidate[]) {
  return [...candidates].sort((left, right) => {
    const durationDelta = left.durationSeconds - right.durationSeconds;
    if (Math.abs(durationDelta) > 1) return durationDelta;
    return left.distanceMeters - right.distanceMeters;
  });
}

export function calculateRouteOverlapRatio(
  left: Pick<RouteCandidate, "geometry" | "distanceMeters">,
  right: Pick<RouteCandidate, "geometry" | "distanceMeters">,
  precisionDecimals = ROUTE_CANDIDATE_DEDUPLICATION.pointPrecisionDecimals,
): number {
  if (left.geometry.coordinates.length < 2 || right.geometry.coordinates.length < 2) {
    return 0;
  }

  const leftEdges = routeEdgeSet(left.geometry.coordinates, precisionDecimals);
  const rightEdges = routeEdgeSet(right.geometry.coordinates, precisionDecimals);
  if (leftEdges.size === 0 || rightEdges.size === 0) return 0;

  let matchingEdges = 0;
  for (const edge of leftEdges) {
    if (rightEdges.has(edge)) matchingEdges += 1;
  }

  const edgeOverlap = matchingEdges / Math.max(leftEdges.size, rightEdges.size);
  const lengthSimilarity =
    Math.min(safeRouteLength(left), safeRouteLength(right)) /
    Math.max(safeRouteLength(left), safeRouteLength(right), 1);

  return clamp01(edgeOverlap * 0.75 + lengthSimilarity * 0.25);
}

export function calculateCandidateDiversity(
  candidate: Pick<RouteCandidate, "geometry" | "distanceMeters">,
  fastest: Pick<RouteCandidate, "geometry" | "distanceMeters">,
): CandidateDiversity {
  const overlapWithFastest = calculateRouteOverlapRatio(candidate, fastest);
  const uniqueMeters = Math.max(0, safeRouteLength(candidate) * (1 - overlapWithFastest));

  return {
    overlapWithFastest,
    uniqueMeters,
    maxLateralSeparationMeters: calculateMaxLateralSeparationMeters(
      candidate.geometry,
      fastest.geometry,
    ),
  };
}

function routeEdgeSet(
  coordinates: RouteCandidate["geometry"]["coordinates"],
  precisionDecimals: number,
) {
  const edges = new Set<string>();

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinateKey(coordinates[index - 1], precisionDecimals);
    const end = coordinateKey(coordinates[index], precisionDecimals);
    edges.add(start < end ? `${start}|${end}` : `${end}|${start}`);
  }

  return edges;
}

function coordinateKey(coordinate: [number, number], precisionDecimals: number) {
  return `${coordinate[0].toFixed(precisionDecimals)},${coordinate[1].toFixed(
    precisionDecimals,
  )}`;
}

function safeRouteLength(route: Pick<RouteCandidate, "geometry" | "distanceMeters">) {
  if (Number.isFinite(route.distanceMeters) && route.distanceMeters > 0) {
    return route.distanceMeters;
  }

  return turfLength(lineString(route.geometry.coordinates), { units: "meters" });
}

function calculateMaxLateralSeparationMeters(
  candidate: RouteCandidate["geometry"],
  fastest: RouteCandidate["geometry"],
) {
  if (candidate.coordinates.length < 2 || fastest.coordinates.length < 2) return 0;

  const candidateLine = lineString(candidate.coordinates);
  const fastestLine = lineString(fastest.coordinates);
  const candidateLengthMeters = turfLength(candidateLine, { units: "kilometers" }) * 1000;
  if (!Number.isFinite(candidateLengthMeters) || candidateLengthMeters <= 0) return 0;

  const sampleCount = 12;
  let maxDistance = 0;
  for (let index = 0; index <= sampleCount; index += 1) {
    const sample = along(candidateLine, (candidateLengthMeters * index) / sampleCount / 1000, {
      units: "kilometers",
    });
    const distanceMeters =
      pointToLineDistance(point(sample.geometry.coordinates), fastestLine, {
        units: "kilometers",
      }) * 1000;
    maxDistance = Math.max(maxDistance, distanceMeters);
  }

  return maxDistance;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
