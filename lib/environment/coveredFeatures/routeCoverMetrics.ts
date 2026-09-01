import {
  along,
  booleanPointInPolygon,
  distance,
  feature,
  featureCollection,
  lineString,
  point,
  pointToLineDistance,
} from "@turf/turf";
import type { FeatureCollection, LineString } from "geojson";
import type { CoveredFeature } from "@/lib/environment/coveredFeatures/types";
import { isRainCoverEligible } from "@/lib/environment/coveredFeatures/semantics";
import type { LineStringGeometry } from "@/lib/geo/types";

export type RouteCoverRun = {
  startMeters: number;
  endMeters: number;
  lengthMeters: number;
  kind: CoveredFeature["kind"] | "mixed";
  averageConfidence: number;
  averageAccessConfidence: number;
};

export type RouteCoverMetrics = {
  routeMeters: number;
  coveredMeters: number;
  exposedMeters: number;
  unknownMeters: number;
  coveredRatio: number;
  exposedRatio: number;
  unknownRatio: number;
  longestContinuousCoveredMeters: number;
  coveredSegmentCount: number;
  averageCoveredRunLength: number;
  routeAccessibleCoveredMeters: number;
  featureIds: string[];
  runs: RouteCoverRun[];
};

const DEFAULT_INTERVAL_METERS = 3;
const COVER_LINE_BUFFER_METERS = 3.5;

export function analyzeRouteCoverMetrics(
  routeGeometry: LineStringGeometry | LineString,
  features: CoveredFeature[],
  options: { intervalMeters?: number } = {},
): RouteCoverMetrics {
  const coordinates = routeGeometry.coordinates;
  const routeMeters = routeLengthMeters(routeGeometry);
  if (coordinates.length < 2 || routeMeters <= 0) return emptyMetrics(routeMeters);

  const intervalMeters = Math.max(1, options.intervalMeters ?? DEFAULT_INTERVAL_METERS);
  const intervals = Math.max(1, Math.ceil(routeMeters / intervalMeters));
  const routeLine = lineString(coordinates);
  const usableFeatures = features.filter(isRainCoverEligible);
  const coveredIntervals: Array<{
    startMeters: number;
    endMeters: number;
    feature: CoveredFeature;
  }> = [];

  for (let index = 0; index < intervals; index += 1) {
    const startMeters = (index / intervals) * routeMeters;
    const endMeters = ((index + 1) / intervals) * routeMeters;
    const midpointMeters = (startMeters + endMeters) / 2;
    const samplePoint = along(routeLine, midpointMeters / 1000, { units: "kilometers" });
    const featureValue = usableFeatures.find((candidate) => pointIsCovered(samplePoint, candidate));
    if (featureValue) {
      coveredIntervals.push({ startMeters, endMeters, feature: featureValue });
    }
  }

  const runs = buildRuns(coveredIntervals);
  const coveredMeters = runs.reduce((sum, run) => sum + run.lengthMeters, 0);
  const unknownMeters = features.length === 0 ? 0 : 0;
  const exposedMeters = Math.max(0, routeMeters - coveredMeters - unknownMeters);

  return {
    routeMeters,
    coveredMeters,
    exposedMeters,
    unknownMeters,
    coveredRatio: routeMeters > 0 ? coveredMeters / routeMeters : 0,
    exposedRatio: routeMeters > 0 ? exposedMeters / routeMeters : 0,
    unknownRatio: routeMeters > 0 ? unknownMeters / routeMeters : 0,
    longestContinuousCoveredMeters: runs.reduce(
      (max, run) => Math.max(max, run.lengthMeters),
      0,
    ),
    coveredSegmentCount: runs.length,
    averageCoveredRunLength: runs.length > 0 ? coveredMeters / runs.length : 0,
    routeAccessibleCoveredMeters: coveredMeters,
    featureIds: [...new Set(coveredIntervals.map((interval) => interval.feature.id))],
    runs,
  };
}

export function routeCoverRunsToFeatureCollection(
  routeGeometry: LineStringGeometry | LineString,
  runs: RouteCoverRun[],
): FeatureCollection<LineString> {
  const coordinates = routeGeometry.coordinates;
  if (coordinates.length < 2 || runs.length === 0) return featureCollection([]);
  const routeLine = lineString(coordinates);
  return featureCollection(
    runs.flatMap((run, index) => {
      const start = along(routeLine, run.startMeters / 1000, { units: "kilometers" });
      const end = along(routeLine, run.endMeters / 1000, { units: "kilometers" });
      return [
        feature(
          {
            type: "LineString",
            coordinates: [start.geometry.coordinates, end.geometry.coordinates],
          },
          {
            id: `covered-run-${index + 1}`,
            lengthMeters: run.lengthMeters,
            kind: run.kind,
            averageConfidence: run.averageConfidence,
            averageAccessConfidence: run.averageAccessConfidence,
          },
        ),
      ];
    }),
  );
}

export function routeLengthMeters(geometry: LineStringGeometry | LineString) {
  let meters = 0;
  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    meters +=
      distance(geometry.coordinates[index - 1], geometry.coordinates[index], {
        units: "kilometers",
      }) * 1000;
  }
  return meters;
}

function buildRuns(
  intervals: Array<{ startMeters: number; endMeters: number; feature: CoveredFeature }>,
) {
  const runs: RouteCoverRun[] = [];
  for (const interval of intervals) {
    const previous = runs[runs.length - 1];
    const sameKind = previous?.kind === interval.feature.kind;
    if (previous && Math.abs(previous.endMeters - interval.startMeters) < 0.001 && sameKind) {
      const previousLength = previous.lengthMeters;
      const nextLength = interval.endMeters - interval.startMeters;
      previous.endMeters = interval.endMeters;
      previous.lengthMeters += nextLength;
      previous.averageConfidence =
        (previous.averageConfidence * previousLength + interval.feature.confidence * nextLength) /
        previous.lengthMeters;
      previous.averageAccessConfidence =
        (previous.averageAccessConfidence * previousLength +
          interval.feature.accessConfidence * nextLength) /
        previous.lengthMeters;
      continue;
    }

    runs.push({
      startMeters: interval.startMeters,
      endMeters: interval.endMeters,
      lengthMeters: interval.endMeters - interval.startMeters,
      kind: interval.feature.kind,
      averageConfidence: interval.feature.confidence,
      averageAccessConfidence: interval.feature.accessConfidence,
    });
  }
  return runs;
}

function pointIsCovered(
  samplePoint: ReturnType<typeof point>,
  featureValue: CoveredFeature,
) {
  if (featureValue.geometry.type === "Polygon") {
    return booleanPointInPolygon(samplePoint, feature(featureValue.geometry));
  }

  const meters = pointToLineDistance(samplePoint, featureValue.geometry, {
    units: "kilometers",
  }) * 1000;
  return meters <= COVER_LINE_BUFFER_METERS;
}

function emptyMetrics(routeMeters: number): RouteCoverMetrics {
  return {
    routeMeters,
    coveredMeters: 0,
    exposedMeters: routeMeters,
    unknownMeters: 0,
    coveredRatio: 0,
    exposedRatio: routeMeters > 0 ? 1 : 0,
    unknownRatio: 0,
    longestContinuousCoveredMeters: 0,
    coveredSegmentCount: 0,
    averageCoveredRunLength: 0,
    routeAccessibleCoveredMeters: 0,
    featureIds: [],
    runs: [],
  };
}
