import {
  booleanPointInPolygon,
  buffer,
  feature,
  featureCollection,
  length,
  point,
} from "@turf/turf";
import type { FeatureCollection, LineString, MultiPolygon, Polygon } from "geojson";
import type { Building } from "@/lib/environment/buildings/types";
import type {
  BuildingShadow,
  RouteSegment,
  RouteShadeSummary,
  SegmentShade,
  ShadeCoverage,
  ShadeQuality,
  TimedRouteSegment,
} from "@/lib/environment/shade/types";
import { createLocalProjection, type ProjectedPoint } from "@/lib/environment/shade/projection";
import type { Coordinate } from "@/lib/geo/types";

const SAMPLE_LENGTH_METERS = 5;
const INTERSECTION_EPSILON = 1e-9;
const MIN_INTERVAL_METERS = 0.01;
const UNKNOWN_HEIGHT_INFLUENCE_BUFFER_METERS = 30;

export function calculateSegmentShade(
  segments: TimedRouteSegment[],
  shadows: BuildingShadow[],
  projectionOrigin: Coordinate,
): SegmentShade[] {
  return calculateSegmentShadeExact(segments, shadows, projectionOrigin);
}

export function calculateSegmentShadeExact(
  segments: TimedRouteSegment[],
  shadows: BuildingShadow[],
  projectionOrigin: Coordinate,
): SegmentShade[] {
  const projection = createLocalProjection(projectionOrigin);

  return segments.map((segment) => {
    const shadowIntervals = shadows.map((shadow) => ({
      confidence: shadow.confidence,
      intervals: safeLineShadowIntervals(segment, shadow, projection),
    }));
    const shadedIntervals = shadowIntervals.flatMap((shadow) => shadow.intervals);
    const mergedIntervals = mergeIntervals(shadedIntervals);
    const shadedMeters = mergedIntervals.reduce(
      (sum, [start, end]) => sum + (end - start) * segment.distanceMeters,
      0,
    );
    const shadeRatio =
      segment.distanceMeters > 0 ? clamp01(shadedMeters / segment.distanceMeters) : 0;
    const intersectingShadowConfidences = shadowIntervals
      .filter((shadow) => shadow.intervals.length > 0)
      .map((shadow) => shadow.confidence);

    return {
      segmentId: segment.id,
      shadeRatio,
      shadedMeters,
      exposedMeters: Math.max(0, segment.distanceMeters - shadedMeters),
      totalMeters: segment.distanceMeters,
      confidence: intersectingShadowConfidences.length
        ? average(intersectingShadowConfidences)
        : 1,
      estimatedEntryTime: segment.estimatedEntryTime,
      estimatedExitTime: segment.estimatedExitTime,
      estimatedMidpointTime: segment.estimatedMidpointTime,
    };
  });
}

export function calculateSegmentShadeBySampling(
  segments: RouteSegment[],
  shadows: BuildingShadow[],
): SegmentShade[] {
  return segments.map((segment) => {
    const sampleCount = Math.max(1, Math.ceil(segment.distanceMeters / SAMPLE_LENGTH_METERS));
    const sampleMeters = segment.distanceMeters / sampleCount;
    let shadedMeters = 0;

    for (let index = 0; index < sampleCount; index += 1) {
      const start = interpolateLineCoordinate(
        segment.geometry.coordinates[0] as [number, number],
        segment.geometry.coordinates[1] as [number, number],
        index / sampleCount,
      );
      const end = interpolateLineCoordinate(
        segment.geometry.coordinates[0] as [number, number],
        segment.geometry.coordinates[1] as [number, number],
        (index + 1) / sampleCount,
      );
      const sampleMidpoint = point([
        (start[0] + end[0]) / 2,
        (start[1] + end[1]) / 2,
      ]);

      if (
        shadows.some((shadow) =>
          booleanPointInPolygon(sampleMidpoint, feature(shadow.geometry)),
        )
      ) {
        shadedMeters += sampleMeters;
      }
    }

    const shadeRatio =
      segment.distanceMeters > 0 ? clamp01(shadedMeters / segment.distanceMeters) : 0;

    return {
      segmentId: segment.id,
      shadeRatio,
      shadedMeters,
      exposedMeters: Math.max(0, segment.distanceMeters - shadedMeters),
      totalMeters: segment.distanceMeters,
      confidence: shadows.length ? average(shadows.map((shadow) => shadow.confidence)) : 0,
    };
  });
}

export function summarizeRouteShade({
  segmentShade,
  routeMeters,
  buildings,
  unknownMeters = 0,
}: {
  segmentShade: SegmentShade[];
  routeMeters: number;
  buildings: Building[];
  unknownMeters?: number;
}): { summary: RouteShadeSummary; coverage: ShadeCoverage; quality: ShadeQuality } {
  const shadedMeters = segmentShade.reduce(
    (sum, segment) => sum + segment.shadedMeters,
    0,
  );
  const usableBuildingCount = buildings.filter((building) => building.heightMeters).length;
  const unknownHeightBuildingCount = buildings.filter(
    (building) => !building.heightMeters,
  ).length;
  const boundedUnknownMeters = Math.min(routeMeters, Math.max(0, unknownMeters));
  const analyzedMeters = Math.max(0, routeMeters - boundedUnknownMeters);
  const explicitHeightBuildingCount = buildings.filter(
    (building) => building.heightSource === "provider" || building.heightSource === "measured",
  ).length;
  const floorDerivedHeightBuildingCount = buildings.filter(
    (building) => building.heightSource === "floors-derived",
  ).length;
  const geometryCoverage = buildings.length > 0 || routeMeters > 0 ? 1 : 0;
  const explicitHeightCoverage =
    buildings.length > 0 ? explicitHeightBuildingCount / buildings.length : 0;
  const derivedHeightCoverage =
    buildings.length > 0 ? floorDerivedHeightBuildingCount / buildings.length : 0;
  const heightCoverage =
    buildings.length > 0
      ? clamp01((explicitHeightBuildingCount + floorDerivedHeightBuildingCount * 0.6) / buildings.length)
      : 0;
  const routeAnalysisCoverage =
    routeMeters > 0 ? clamp01((routeMeters - boundedUnknownMeters) / routeMeters) : 0;
  const quality: ShadeQuality = {
    geometryCoverage,
    heightCoverage,
    explicitHeightCoverage,
    derivedHeightCoverage,
    routeAnalysisCoverage,
    overallConfidence: clamp01(geometryCoverage * heightCoverage * routeAnalysisCoverage),
  };
  const confidence = quality.overallConfidence;
  const shadeRatio = routeMeters > 0 ? clamp01(shadedMeters / routeMeters) : 0;

  return {
    summary: {
      shadeRatio,
      shadedMeters,
      exposedMeters: Math.max(0, routeMeters - shadedMeters - boundedUnknownMeters),
      analyzedMeters,
      unknownMeters: boundedUnknownMeters,
      confidence,
    },
    coverage: {
      routeMeters,
      analyzedMeters,
      unknownMeters: boundedUnknownMeters,
      buildingCount: buildings.length,
      usableBuildingCount,
      explicitHeightBuildingCount,
      floorDerivedHeightBuildingCount,
      unknownHeightBuildingCount,
    },
    quality,
  };
}

export function calculateUnknownHeightMeters({
  segments,
  buildings,
  projectionOrigin,
}: {
  segments: TimedRouteSegment[];
  buildings: Building[];
  projectionOrigin: Coordinate;
}) {
  const uncertaintyAreas = buildings
    .filter((building) => !building.heightMeters)
    .flatMap((building) => {
      try {
        const buffered = buffer(feature(building.footprint), UNKNOWN_HEIGHT_INFLUENCE_BUFFER_METERS, {
          units: "meters",
        });
        if (!buffered?.geometry) return [];
        if (buffered.geometry.type !== "Polygon" && buffered.geometry.type !== "MultiPolygon") {
          return [];
        }

        return [
          {
            buildingId: building.id,
            geometry: buffered.geometry,
            sourceHeightMeters: 0,
            confidence: 0,
          } satisfies BuildingShadow,
        ];
      } catch {
        return [];
      }
    });

  return calculateSegmentShadeExact(segments, uncertaintyAreas, projectionOrigin).reduce(
    (sum, segment) => sum + segment.shadedMeters,
    0,
  );
}

export function segmentsToFeatureCollection(
  segments: TimedRouteSegment[],
  segmentShade: SegmentShade[],
): FeatureCollection<LineString> {
  return featureCollection(
    segments.map((segment) => {
      const shade = segmentShade.find((value) => value.segmentId === segment.id);
      return feature(segment.geometry, {
        id: segment.id,
        shadeRatio: shade?.shadeRatio ?? 0,
        shadedMeters: shade?.shadedMeters ?? 0,
        exposedMeters: shade?.exposedMeters ?? segment.distanceMeters,
        totalMeters: shade?.totalMeters ?? segment.distanceMeters,
        estimatedEntryTime: segment.estimatedEntryTime,
        estimatedExitTime: segment.estimatedExitTime,
        estimatedMidpointTime: segment.estimatedMidpointTime,
        solarAzimuthDeg: shade?.solarAzimuthDeg,
        solarElevationDeg: shade?.solarElevationDeg,
      });
    }),
  );
}

export function shadowsToFeatureCollection(
  shadows: BuildingShadow[],
): FeatureCollection<Polygon | MultiPolygon> {
  return featureCollection(
    shadows.map((shadow) =>
      feature(shadow.geometry, {
        buildingId: shadow.buildingId,
        sourceHeightMeters: shadow.sourceHeightMeters,
        confidence: shadow.confidence,
      }),
    ),
  );
}

export function buildingsToFeatureCollection(
  buildings: Building[],
): FeatureCollection<Polygon | MultiPolygon> {
  return featureCollection(
    buildings.map((building) =>
      feature(building.footprint, {
        id: building.id,
        heightMeters: building.heightMeters,
        heightSource: building.heightSource,
        confidence: building.confidence,
      }),
    ),
  );
}

export function routeLengthMeters(geometry: LineString) {
  return length(feature(geometry), { units: "kilometers" }) * 1000;
}

function interpolateLineCoordinate(
  start: [number, number],
  end: [number, number],
  ratio: number,
): [number, number] {
  return [
    start[0] + (end[0] - start[0]) * ratio,
    start[1] + (end[1] - start[1]) * ratio,
  ];
}

function lineShadowIntervals(
  segment: RouteSegment,
  shadow: BuildingShadow,
  projection: ReturnType<typeof createLocalProjection>,
): Array<[number, number]> {
  const startCoordinate = segment.geometry.coordinates[0] as [number, number] | undefined;
  const endCoordinate = segment.geometry.coordinates[1] as [number, number] | undefined;
  if (!startCoordinate || !endCoordinate || segment.distanceMeters <= 0) return [];

  const start = projection.project({
    longitude: startCoordinate[0],
    latitude: startCoordinate[1],
  });
  const end = projection.project({
    longitude: endCoordinate[0],
    latitude: endCoordinate[1],
  });
  const candidateCuts = [0, 1];

  for (const polygon of polygonParts(shadow.geometry)) {
    for (const ring of polygon.coordinates) {
      for (let index = 0; index < ring.length - 1; index += 1) {
        const ringStart = ring[index];
        const ringEnd = ring[index + 1];
        if (!ringStart || !ringEnd) continue;
        const intersection = segmentEdgeIntersectionRatio(
          start,
          end,
          projection.project({ longitude: ringStart[0], latitude: ringStart[1] }),
          projection.project({ longitude: ringEnd[0], latitude: ringEnd[1] }),
        );
        if (intersection !== null) candidateCuts.push(intersection);
      }
    }
  }

  const cuts = uniqueSortedRatios(candidateCuts);
  const intervals: Array<[number, number]> = [];

  for (let index = 0; index < cuts.length - 1; index += 1) {
    const intervalStart = cuts[index];
    const intervalEnd = cuts[index + 1];
    if ((intervalEnd - intervalStart) * segment.distanceMeters < MIN_INTERVAL_METERS) continue;

    const midpointRatio = (intervalStart + intervalEnd) / 2;
    const midpointCoordinate = interpolateLineCoordinate(
      startCoordinate,
      endCoordinate,
      midpointRatio,
    );

    if (
      booleanPointInPolygon(point(midpointCoordinate), feature(shadow.geometry), {
        ignoreBoundary: true,
      })
    ) {
      intervals.push([intervalStart, intervalEnd]);
    }
  }

  return intervals;
}

function safeLineShadowIntervals(
  segment: RouteSegment,
  shadow: BuildingShadow,
  projection: ReturnType<typeof createLocalProjection>,
) {
  try {
    return lineShadowIntervals(segment, shadow, projection);
  } catch {
    return [];
  }
}

function segmentEdgeIntersectionRatio(
  segmentStart: ProjectedPoint,
  segmentEnd: ProjectedPoint,
  edgeStart: ProjectedPoint,
  edgeEnd: ProjectedPoint,
) {
  const segmentVector = [
    segmentEnd[0] - segmentStart[0],
    segmentEnd[1] - segmentStart[1],
  ];
  const edgeVector = [edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1]];
  const denominator = cross(segmentVector, edgeVector);
  if (Math.abs(denominator) < INTERSECTION_EPSILON) return null;

  const startDelta = [edgeStart[0] - segmentStart[0], edgeStart[1] - segmentStart[1]];
  const segmentRatio = cross(startDelta, edgeVector) / denominator;
  const edgeRatio = cross(startDelta, segmentVector) / denominator;

  if (
    segmentRatio < -INTERSECTION_EPSILON ||
    segmentRatio > 1 + INTERSECTION_EPSILON ||
    edgeRatio < -INTERSECTION_EPSILON ||
    edgeRatio > 1 + INTERSECTION_EPSILON
  ) {
    return null;
  }

  return clamp01(segmentRatio);
}

function uniqueSortedRatios(values: number[]) {
  return values
    .filter((value) => Number.isFinite(value))
    .map(clamp01)
    .sort((a, b) => a - b)
    .reduce<number[]>((unique, value) => {
      const previous = unique.at(-1);
      if (previous === undefined || Math.abs(previous - value) > INTERSECTION_EPSILON) {
        unique.push(value);
      }
      return unique;
    }, []);
}

function mergeIntervals(intervals: Array<[number, number]>) {
  return intervals
    .filter(([start, end]) => end - start > INTERSECTION_EPSILON)
    .sort(([leftStart], [rightStart]) => leftStart - rightStart)
    .reduce<Array<[number, number]>>((merged, interval) => {
      const previous = merged.at(-1);
      if (!previous || interval[0] > previous[1] + INTERSECTION_EPSILON) {
        merged.push([...interval]);
      } else {
        previous[1] = Math.max(previous[1], interval[1]);
      }
      return merged;
    }, []);
}

function polygonParts(geometry: Polygon | MultiPolygon): Polygon[] {
  if (geometry.type === "Polygon") return [geometry];
  return geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }));
}

function cross(left: number[], right: number[]) {
  return left[0] * right[1] - left[1] * right[0];
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
