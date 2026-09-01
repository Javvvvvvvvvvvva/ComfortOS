import {
  featureCollection,
  feature,
} from "@turf/turf";
import type { FeatureCollection, LineString } from "geojson";
import type { CoveredFeature } from "@/lib/environment/coveredFeatures/types";
import {
  analyzeRouteCoverMetrics,
  routeCoverRunsToFeatureCollection,
} from "@/lib/environment/coveredFeatures/routeCoverMetrics";
import { clamp01 } from "@/lib/comfort/thermal";
import {
  assignSegmentTraversalTimes,
  segmentRouteGeometry,
} from "@/lib/environment/shade/routeSegmentation";
import { routeLengthMeters } from "@/lib/environment/shade/shadeIntersectionEngine";
import { selectRainWeatherForTime } from "@/lib/environment/rain/rainWeather";
import type {
  RainAnalysisRequest,
  RainAnalysisResult,
  SegmentRainExposure,
} from "@/lib/environment/rain/types";
import type { TimedRouteSegment } from "@/lib/environment/shade/types";

export const RAIN_ENGINE_CONSTANTS = {
  sampleSpacingMeters: 6,
  lightRainMmPerHour: 1,
  heavyRainMmPerHour: 8,
  maxWindDrivenModifier: 1.6,
  windDrivenFullEffectMps: 10,
  windDirectionalEffectFloor: 0.35,
};

export class RainAnalysisService {
  async analyzeRouteRain(request: RainAnalysisRequest): Promise<RainAnalysisResult> {
    const departureDate = new Date(request.departureTime);
    if (Number.isNaN(departureDate.valueOf())) {
      throw new Error("Invalid rain-analysis timestamp.");
    }

    const routeGeometry = request.route.geometry;
    const routeMeters = routeLengthMeters(routeGeometry);
    const routeCover =
      request.coveredFeatures === undefined || request.coveredFeatures === null
        ? null
        : analyzeRouteCoverMetrics(routeGeometry, request.coveredFeatures);
    const timedSegments = assignSegmentTraversalTimes({
      segments: segmentRouteGeometry(routeGeometry),
      departureTime: departureDate.toISOString(),
      routeDurationSeconds: request.route.durationSeconds,
    });
    const coveredFeatures = request.coveredFeatures ?? null;
    const segmentRain = timedSegments.map((segment) =>
      analyzeSegmentRain({
        segment,
        routeMeters,
        routeDurationSeconds: request.route.durationSeconds,
        routeCoverKnown: coveredFeatures !== null,
        coveredFeatures,
        request,
      }),
    );
    const summary = summarizeRouteRain(segmentRain, routeMeters, routeCover);

    return {
      status: "available",
      routeGeometry,
      departureTime: departureDate.toISOString(),
      segmentRain,
      summary,
      quality: {
        precipitationIntensityAvailable: segmentRain.some(
          (segment) => segment.precipitationIntensityMmPerHour !== null,
        ),
        precipitationProbabilityAvailable: segmentRain.some(
          (segment) => segment.precipitationProbability !== null,
        ),
        coverDataAvailable: coveredFeatures !== null,
        routeAnalysisCoverage: routeMeters > 0 ? summary.analyzedMeters / routeMeters : 0,
        overallConfidence: summary.confidence,
      },
      debug: {
        segments: rainSegmentsToFeatureCollection(timedSegments, segmentRain),
        coveredRuns: routeCover
          ? routeCoverRunsToFeatureCollection(routeGeometry, routeCover.runs)
          : featureCollection([]),
        runs: routeCover?.runs ?? [],
        note:
          "Rain exposure is deterministic from normalized precipitation intensity, covered-feature geometry, route timing, access-aware cover evidence, and regional wind. Probability is not treated as rainfall intensity.",
      },
    };
  }
}

function analyzeSegmentRain({
  segment,
  routeMeters,
  routeDurationSeconds,
  routeCoverKnown,
  coveredFeatures,
  request,
}: {
  segment: TimedRouteSegment;
  routeMeters: number;
  routeDurationSeconds: number;
  routeCoverKnown: boolean;
  coveredFeatures: CoveredFeature[] | null;
  request: RainAnalysisRequest;
}): SegmentRainExposure {
  const weather = selectRainWeatherForTime(
    request.weatherBundle,
    segment.estimatedMidpointTime,
  );
  const durationSeconds =
    routeMeters > 0
      ? (segment.distanceMeters / routeMeters) * Math.max(0, routeDurationSeconds)
      : Math.max(
          0,
          (Date.parse(segment.estimatedExitTime) - Date.parse(segment.estimatedEntryTime)) /
            1000,
        );
  const cover = routeCoverKnown
    ? calculateSegmentCover(segment.geometry, coveredFeatures ?? [])
    : { coveredRatio: 0, unknownRatio: 1 };
  const intensity = normalizeRainIntensity(weather.precipitationIntensityMmPerHour);
  const precipitationFactor = intensity === null ? null : clamp01(intensity / RAIN_ENGINE_CONSTANTS.heavyRainMmPerHour);
  const windDrivenExposureFactor = calculateWindDrivenRainModifier({
    windSpeedMps: weather.regionalWindSpeedMps,
    windDirectionDeg: weather.regionalWindDirectionDeg,
    segmentBearingDeg: segment.bearingDegrees,
    coveredRatio: cover.coveredRatio,
  });
  const exposedRatio = routeCoverKnown ? clamp01(1 - cover.coveredRatio) : 0;
  const estimatedRainExposure =
    precipitationFactor === null
      ? 0
      : precipitationFactor * exposedRatio * windDrivenExposureFactor;
  const confidence = calculateSegmentRainConfidence({
    weatherConfidence: weather.confidence,
    precipitationFactor,
    coveredFeatures,
    coveredRatio: cover.coveredRatio,
    unknownRatio: cover.unknownRatio,
  });

  return {
    segmentId: segment.id,
    timestamp: segment.estimatedMidpointTime,
    distanceMeters: segment.distanceMeters,
    durationSeconds,
    precipitationIntensityMmPerHour: intensity,
    precipitationProbability: weather.precipitationProbability ?? null,
    regionalWindSpeedMps: weather.regionalWindSpeedMps ?? null,
    regionalWindDirectionDeg: weather.regionalWindDirectionDeg ?? null,
    coveredRatio: cover.coveredRatio,
    exposedRatio,
    unknownRatio: cover.unknownRatio,
    coveredMeters: segment.distanceMeters * cover.coveredRatio,
    exposedMeters: segment.distanceMeters * exposedRatio,
    unknownMeters: segment.distanceMeters * cover.unknownRatio,
    windDrivenExposureFactor,
    estimatedRainExposure,
    confidence,
  };
}

export function calculateWindDrivenRainModifier({
  windSpeedMps,
  windDirectionDeg,
  segmentBearingDeg,
  coveredRatio,
}: {
  windSpeedMps?: number | null;
  windDirectionDeg?: number | null;
  segmentBearingDeg: number;
  coveredRatio: number;
}) {
  if (
    typeof windSpeedMps !== "number" ||
    !Number.isFinite(windSpeedMps) ||
    windSpeedMps <= 0 ||
    typeof windDirectionDeg !== "number" ||
    !Number.isFinite(windDirectionDeg)
  ) {
    return 1;
  }

  const angle = smallestAngleDifference(windDirectionDeg, segmentBearingDeg);
  const directionalEffect =
    RAIN_ENGINE_CONSTANTS.windDirectionalEffectFloor +
    (1 - RAIN_ENGINE_CONSTANTS.windDirectionalEffectFloor) * Math.sin((angle * Math.PI) / 180);
  const windRatio = clamp01(windSpeedMps / RAIN_ENGINE_CONSTANTS.windDrivenFullEffectMps);
  const coverLeakage = 1 - clamp01(coveredRatio) * 0.55;
  return Math.min(
    RAIN_ENGINE_CONSTANTS.maxWindDrivenModifier,
    1 + 0.6 * windRatio * directionalEffect * coverLeakage,
  );
}

function calculateSegmentCover(segmentGeometry: LineString, features: CoveredFeature[]) {
  const metrics = analyzeRouteCoverMetrics(segmentGeometry, features, {
    intervalMeters: RAIN_ENGINE_CONSTANTS.sampleSpacingMeters,
  });
  return {
    coveredRatio: metrics.coveredRatio,
    unknownRatio: metrics.unknownRatio,
  };
}

function summarizeRouteRain(
  segmentRain: SegmentRainExposure[],
  routeMeters: number,
  routeCover: ReturnType<typeof analyzeRouteCoverMetrics> | null,
) {
  const totalDurationSeconds = segmentRain.reduce(
    (sum, segment) => sum + segment.durationSeconds,
    0,
  );
  const coveredMeters = segmentRain.reduce((sum, segment) => sum + segment.coveredMeters, 0);
  const exposedMeters = segmentRain.reduce((sum, segment) => sum + segment.exposedMeters, 0);
  const unknownMeters = segmentRain.reduce((sum, segment) => sum + segment.unknownMeters, 0);
  const totalRainExposureCost = segmentRain.reduce(
    (sum, segment) =>
      sum + segment.estimatedRainExposure * Math.max(0, segment.durationSeconds / 60),
    0,
  );
  const averageRainExposure =
    totalDurationSeconds > 0
      ? totalRainExposureCost / Math.max(1, totalDurationSeconds / 60)
      : 0;
  const confidence = clamp01(timeWeightedAverage(segmentRain, (segment) => segment.confidence));
  const completeness = routeMeters > 0 ? clamp01((routeMeters - unknownMeters) / routeMeters) : 0;

  return {
    analyzedMeters: Math.max(0, routeMeters - unknownMeters),
    coveredMeters,
    exposedMeters,
    unknownMeters,
    longestContinuousCoveredMeters: routeCover?.longestContinuousCoveredMeters ?? 0,
    coveredSegmentCount: routeCover?.coveredSegmentCount ?? 0,
    averageCoveredRunLength: routeCover?.averageCoveredRunLength ?? 0,
    averageRainExposure,
    totalRainExposureCost,
    confidence,
    completeness,
  };
}

function rainSegmentsToFeatureCollection(
  segments: TimedRouteSegment[],
  segmentRain: SegmentRainExposure[],
): FeatureCollection<LineString> {
  return featureCollection(
    segments.map((segment) => {
      const rain = segmentRain.find((value) => value.segmentId === segment.id);
      return feature(segment.geometry, {
        id: segment.id,
        estimatedRainExposure: rain?.estimatedRainExposure ?? 0,
        coveredRatio: rain?.coveredRatio ?? 0,
        exposedRatio: rain?.exposedRatio ?? 0,
        unknownRatio: rain?.unknownRatio ?? 1,
        precipitationIntensityMmPerHour: rain?.precipitationIntensityMmPerHour ?? null,
        precipitationProbability: rain?.precipitationProbability ?? null,
        windDrivenExposureFactor: rain?.windDrivenExposureFactor ?? 1,
        confidence: rain?.confidence ?? 0,
      });
    }),
  );
}

function calculateSegmentRainConfidence({
  weatherConfidence,
  precipitationFactor,
  coveredFeatures,
  coveredRatio,
  unknownRatio,
}: {
  weatherConfidence: number;
  precipitationFactor: number | null;
  coveredFeatures: CoveredFeature[] | null;
  coveredRatio: number;
  unknownRatio: number;
}) {
  const precipitationConfidence = precipitationFactor === null ? 0.2 : weatherConfidence;
  const coverConfidence = coveredFeatures === null ? 0 : coveredRatio > 0 ? 0.78 : 0.58;
  return clamp01(precipitationConfidence * 0.56 + coverConfidence * 0.34 + (1 - unknownRatio) * 0.1);
}

function normalizeRainIntensity(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return Math.max(0, value);
}

function timeWeightedAverage(
  segments: SegmentRainExposure[],
  selector: (segment: SegmentRainExposure) => number,
) {
  const durationSeconds = segments.reduce((sum, segment) => sum + segment.durationSeconds, 0);
  if (durationSeconds <= 0) return 0;
  return (
    segments.reduce(
      (sum, segment) => sum + selector(segment) * segment.durationSeconds,
      0,
    ) / durationSeconds
  );
}

function smallestAngleDifference(left: number, right: number) {
  return Math.abs((((left - right) % 360) + 540) % 360 - 180);
}
