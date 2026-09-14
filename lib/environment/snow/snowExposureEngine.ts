import { feature, featureCollection } from "@turf/turf";
import type { FeatureCollection, LineString } from "geojson";
import { selectComfortWeatherForTime } from "@/lib/comfort/context";
import { clamp01 } from "@/lib/comfort/thermal";
import {
  analyzeRouteCoverMetrics,
  routeCoverRunsToFeatureCollection,
} from "@/lib/environment/coveredFeatures/routeCoverMetrics";
import {
  assignSegmentTraversalTimes,
  segmentRouteGeometry,
} from "@/lib/environment/shade/routeSegmentation";
import { routeLengthMeters } from "@/lib/environment/shade/shadeIntersectionEngine";
import type { TimedRouteSegment } from "@/lib/environment/shade/types";
import type {
  SegmentSnowExposure,
  SnowAnalysisRequest,
  SnowAnalysisResult,
} from "@/lib/environment/snow/types";
import type { PrecipitationType } from "@/lib/weather/precipitation";

export const SNOW_MODEL_VERSION = "snow-v1.0.0";

export const SNOW_ENGINE_CONSTANTS = {
  snowfallFullExposureMmPerHour: 12.5,
  iceFullExposureMmPerHour: 0.25,
  windDrivenFullEffectMps: 10,
  maxWindDrivenSnowFactor: 1.5,
};

export class SnowAnalysisService {
  async analyzeRouteSnow(request: SnowAnalysisRequest): Promise<SnowAnalysisResult> {
    const departureDate = new Date(request.departureTime);
    if (Number.isNaN(departureDate.valueOf())) {
      throw new Error("Invalid snow-analysis timestamp.");
    }

    const routeGeometry = request.route.geometry;
    const routeMeters = routeLengthMeters(routeGeometry);
    const routeCover =
      request.coveredFeatures === undefined || request.coveredFeatures === null
        ? null
        : analyzeRouteCoverMetrics(routeGeometry, request.coveredFeatures);
    const segments = assignSegmentTraversalTimes({
      segments: segmentRouteGeometry(routeGeometry),
      departureTime: departureDate.toISOString(),
      routeDurationSeconds: request.route.durationSeconds,
    });
    const segmentSnow = segments.map((segment) =>
      analyzeSegmentSnow(segment, routeMeters, request),
    );
    const summary = summarizeSnow(segmentSnow, routeMeters, routeCover);

    return {
      status: "available",
      modelVersion: SNOW_MODEL_VERSION,
      routeGeometry,
      departureTime: departureDate.toISOString(),
      segmentSnow,
      summary,
      quality: {
        snowfallRateAvailable: segmentSnow.some(
          (segment) => segment.snowfallMmPerHour !== null,
        ),
        iceAccumulationRateAvailable: segmentSnow.some(
          (segment) => segment.iceAccumulationMmPerHour !== null,
        ),
        precipitationTypeAvailable: segmentSnow.some(
          (segment) => segment.precipitationType !== null,
        ),
        windAnalysisAvailable: Boolean(request.windAnalysis),
        coverDataAvailable: routeCover !== null,
        terrainGradeAvailable: false,
        overallConfidence: summary.confidence,
      },
      debug: {
        segments: snowSegmentsToFeatureCollection(segments, segmentSnow),
        coveredRuns: routeCover
          ? routeCoverRunsToFeatureCollection(routeGeometry, routeCover.runs)
          : featureCollection([]),
        runs: routeCover?.runs ?? [],
        note:
          "Snow Comfort v1 uses normalized NWS snowfall and ice accumulation rates, route timing, access-aware overhead cover, and estimated pedestrian wind. It does not claim plowed, ice-free, accessible, or safe pavement, and terrain grade is not active.",
      },
    };
  }
}

function analyzeSegmentSnow(
  segment: TimedRouteSegment,
  routeMeters: number,
  request: SnowAnalysisRequest,
): SegmentSnowExposure {
  const weather = selectComfortWeatherForTime(
    request.weatherBundle,
    segment.estimatedMidpointTime,
  );
  const wind = request.windAnalysis?.segmentWind.find(
    (candidate) => candidate.segmentId === segment.id,
  );
  const durationSeconds =
    routeMeters > 0
      ? (segment.distanceMeters / routeMeters) * Math.max(0, request.route.durationSeconds)
      : 0;
  const coverKnown = request.coveredFeatures !== undefined && request.coveredFeatures !== null;
  const cover = coverKnown
    ? analyzeRouteCoverMetrics(segment.geometry, request.coveredFeatures ?? [], {
        intervalMeters: 6,
      })
    : null;
  const snowfallMmPerHour = nonNegativeOrNull(weather.snowfallMmPerHour);
  const iceAccumulationMmPerHour = nonNegativeOrNull(
    weather.iceAccumulationMmPerHour,
  );
  const weatherKnown = snowfallMmPerHour !== null && iceAccumulationMmPerHour !== null;
  const coveredRatio = cover?.coveredRatio ?? 0;
  const exposedRatio = cover?.exposedRatio ?? 0;
  const unknownCoverRatio = cover ? 0 : 1;
  const conservativeExposureRatio = cover ? exposedRatio : 1;
  const estimatedWindExposureMps = nonNegativeOrNull(
    wind?.estimatedWindExposureMps ?? weather.regionalWindSpeedMps,
  );
  const windDrivenSnowFactor = calculateWindDrivenSnowFactor(
    estimatedWindExposureMps,
  );
  const snowfallFactor =
    snowfallMmPerHour === null
      ? 0
      : clamp01(snowfallMmPerHour / SNOW_ENGINE_CONSTANTS.snowfallFullExposureMmPerHour);
  const iceFactor =
    iceAccumulationMmPerHour === null
      ? 0
      : clamp01(
          iceAccumulationMmPerHour /
            SNOW_ENGINE_CONSTANTS.iceFullExposureMmPerHour,
        );
  const weatherConfidence = weatherKnown ? weather.confidence : weather.confidence * 0.2;
  const windConfidence = wind
    ? wind.confidence
    : estimatedWindExposureMps !== null
      ? weather.confidence * 0.5
      : 0;
  const coverConfidence = coverKnown ? (coveredRatio > 0 ? 0.8 : 0.68) : 0;
  const confidence = clamp01(
    weatherConfidence * 0.58 + windConfidence * 0.3 + coverConfidence * 0.12,
  );
  const completeness = clamp01(
    (weatherKnown ? 0.6 : 0) +
      (estimatedWindExposureMps !== null ? (wind ? 0.3 : 0.15) : 0) +
      (coverKnown ? 0.1 : 0),
  );

  return {
    segmentId: segment.id,
    timestamp: segment.estimatedMidpointTime,
    distanceMeters: segment.distanceMeters,
    durationSeconds,
    precipitationType: weather.precipitationType ?? null,
    temperatureC: finiteNumberOrNull(weather.temperatureC),
    snowfallMmPerHour,
    iceAccumulationMmPerHour,
    coveredRatio,
    exposedRatio,
    unknownCoverRatio,
    conservativeExposureRatio,
    estimatedWindExposureMps,
    windDrivenSnowFactor,
    estimatedSnowfallExposure:
      snowfallFactor * conservativeExposureRatio * windDrivenSnowFactor,
    estimatedIceExposure: iceFactor,
    confidence,
    completeness,
  };
}

export function calculateWindDrivenSnowFactor(
  estimatedWindExposureMps: number | null | undefined,
) {
  if (
    typeof estimatedWindExposureMps !== "number" ||
    !Number.isFinite(estimatedWindExposureMps) ||
    estimatedWindExposureMps <= 0
  ) {
    return 1;
  }
  return Math.min(
    SNOW_ENGINE_CONSTANTS.maxWindDrivenSnowFactor,
    1 +
      0.5 *
        clamp01(
          estimatedWindExposureMps /
            SNOW_ENGINE_CONSTANTS.windDrivenFullEffectMps,
        ),
  );
}

function summarizeSnow(
  segments: SegmentSnowExposure[],
  routeMeters: number,
  routeCover: ReturnType<typeof analyzeRouteCoverMetrics> | null,
) {
  const knownWeatherMeters = segments.reduce(
    (total, segment) =>
      total +
      (segment.snowfallMmPerHour !== null && segment.iceAccumulationMmPerHour !== null
        ? segment.distanceMeters
        : 0),
    0,
  );
  const totalSnowExposureCost = segments.reduce(
    (total, segment) =>
      total +
      (segment.estimatedSnowfallExposure + segment.estimatedIceExposure) *
        Math.max(0, segment.durationSeconds / 60),
    0,
  );

  return {
    analyzedMeters: Math.min(routeMeters, knownWeatherMeters),
    unknownMeters: Math.max(0, routeMeters - knownWeatherMeters),
    coveredMeters: routeCover?.coveredMeters ?? 0,
    exposedMeters: routeCover?.exposedMeters ?? 0,
    unknownCoverMeters: routeCover ? 0 : routeMeters,
    longestContinuousCoveredMeters:
      routeCover?.longestContinuousCoveredMeters ?? 0,
    averageSnowfallExposure: timeWeightedAverage(
      segments,
      (segment) => segment.estimatedSnowfallExposure,
    ),
    averageIceExposure: timeWeightedAverage(
      segments,
      (segment) => segment.estimatedIceExposure,
    ),
    maximumSnowfallMmPerHour: maximumKnown(
      segments.map((segment) => segment.snowfallMmPerHour),
    ),
    maximumIceAccumulationMmPerHour: maximumKnown(
      segments.map((segment) => segment.iceAccumulationMmPerHour),
    ),
    totalSnowExposureCost,
    confidence: clamp01(
      timeWeightedAverage(segments, (segment) => segment.confidence),
    ),
    completeness: clamp01(
      timeWeightedAverage(segments, (segment) => segment.completeness),
    ),
  };
}

function snowSegmentsToFeatureCollection(
  timedSegments: TimedRouteSegment[],
  snowSegments: SegmentSnowExposure[],
): FeatureCollection<LineString> {
  return featureCollection(
    timedSegments.map((segment) => {
      const snow = snowSegments.find((candidate) => candidate.segmentId === segment.id);
      return feature(segment.geometry, {
        id: segment.id,
        precipitationType: snow?.precipitationType ?? null,
        snowfallMmPerHour: snow?.snowfallMmPerHour ?? null,
        iceAccumulationMmPerHour: snow?.iceAccumulationMmPerHour ?? null,
        estimatedSnowfallExposure: snow?.estimatedSnowfallExposure ?? 0,
        estimatedIceExposure: snow?.estimatedIceExposure ?? 0,
        coveredRatio: snow?.coveredRatio ?? 0,
        unknownCoverRatio: snow?.unknownCoverRatio ?? 1,
        estimatedWindExposureMps: snow?.estimatedWindExposureMps ?? null,
        confidence: snow?.confidence ?? 0,
        completeness: snow?.completeness ?? 0,
      });
    }),
  );
}

function timeWeightedAverage(
  segments: SegmentSnowExposure[],
  selector: (segment: SegmentSnowExposure) => number,
) {
  const durationSeconds = segments.reduce(
    (total, segment) => total + segment.durationSeconds,
    0,
  );
  if (durationSeconds <= 0) return 0;
  return (
    segments.reduce(
      (total, segment) => total + selector(segment) * segment.durationSeconds,
      0,
    ) / durationSeconds
  );
}

function maximumKnown(values: Array<number | null>) {
  const known = values.filter((value): value is number => value !== null);
  return known.length > 0 ? Math.max(...known) : null;
}

function nonNegativeOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;
}

function finiteNumberOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isSnowOrIceType(value: PrecipitationType | null | undefined) {
  return (
    value === "snow" ||
    value === "sleet" ||
    value === "freezing-rain" ||
    value === "mixed"
  );
}
