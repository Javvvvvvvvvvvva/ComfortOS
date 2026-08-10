import { along, bearing, length, lineString } from "@turf/turf";
import type { LineString } from "geojson";
import type { LineStringGeometry } from "@/lib/geo/types";
import type { RouteSegment, TimedRouteSegment } from "@/lib/environment/shade/types";

const DEFAULT_SEGMENT_LENGTH_METERS = 30;

export function segmentRouteGeometry(
  geometry: LineStringGeometry,
  segmentLengthMeters = DEFAULT_SEGMENT_LENGTH_METERS,
): RouteSegment[] {
  const routeLine = lineString(geometry.coordinates);
  const totalMeters = length(routeLine, { units: "kilometers" }) * 1000;
  if (!Number.isFinite(totalMeters) || totalMeters <= 0) return [];

  const segmentCount = Math.max(1, Math.ceil(totalMeters / segmentLengthMeters));

  return Array.from({ length: segmentCount }, (_, index) => {
    const startDistanceMeters = (index / segmentCount) * totalMeters;
    const endDistanceMeters = ((index + 1) / segmentCount) * totalMeters;
    const start = along(routeLine, startDistanceMeters / 1000, {
      units: "kilometers",
    }).geometry.coordinates as [number, number];
    const end = along(routeLine, endDistanceMeters / 1000, {
      units: "kilometers",
    }).geometry.coordinates as [number, number];
    const segmentGeometry: LineString = {
      type: "LineString",
      coordinates: [start, end],
    };

    return {
      id: `segment-${index + 1}`,
      geometry: segmentGeometry,
      distanceMeters: endDistanceMeters - startDistanceMeters,
      bearingDegrees: ((bearing(start, end) % 360) + 360) % 360,
      startDistanceMeters,
      endDistanceMeters,
    };
  });
}

export function assignSegmentTraversalTimes({
  segments,
  departureTime,
  routeDurationSeconds,
}: {
  segments: RouteSegment[];
  departureTime: string;
  routeDurationSeconds: number;
}): TimedRouteSegment[] {
  const departureDate = new Date(departureTime);
  if (Number.isNaN(departureDate.valueOf())) throw new Error("Invalid route departure time.");

  const routeMeters = segments.at(-1)?.endDistanceMeters ?? 0;
  const durationMs =
    Number.isFinite(routeDurationSeconds) && routeDurationSeconds > 0
      ? routeDurationSeconds * 1000
      : 0;

  return segments.map((segment) => {
    const entryRatio = routeMeters > 0 ? segment.startDistanceMeters / routeMeters : 0;
    const exitRatio = routeMeters > 0 ? segment.endDistanceMeters / routeMeters : entryRatio;
    const midpointRatio = (entryRatio + exitRatio) / 2;

    return {
      ...segment,
      estimatedEntryTime: new Date(
        departureDate.valueOf() + durationMs * entryRatio,
      ).toISOString(),
      estimatedExitTime: new Date(
        departureDate.valueOf() + durationMs * exitRatio,
      ).toISOString(),
      estimatedMidpointTime: new Date(
        departureDate.valueOf() + durationMs * midpointRatio,
      ).toISOString(),
    };
  });
}
