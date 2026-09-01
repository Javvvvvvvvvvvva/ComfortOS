import { feature, featureCollection } from "@turf/turf";
import type { FeatureCollection, LineString } from "geojson";
import { clamp01 } from "@/lib/comfort/thermal";
import { selectComfortWeatherForTime } from "@/lib/comfort/context";
import {
  assignSegmentTraversalTimes,
  segmentRouteGeometry,
} from "@/lib/environment/shade/routeSegmentation";
import { routeLengthMeters } from "@/lib/environment/shade/shadeIntersectionEngine";
import { selectEffectiveHeatTemperatureC } from "@/lib/environment/heat/heatIndex";
import type {
  HeatAnalysisRequest,
  HeatAnalysisResult,
  SegmentHeatExposure,
} from "@/lib/environment/heat/types";
import type { TimedRouteSegment } from "@/lib/environment/shade/types";

export const HEAT_ENGINE_CONSTANTS = {
  warmThresholdC: 26,
  severeHeatC: 43,
  extremeHeatC: 47,
  ambientHeatWeight: 3.1,
  humidityWeight: 0.45,
  solarExposureWeight: 2.2,
  maxVentilationBenefit: 0.32,
  ventilationFullEffectMps: 4,
  directSunRunThreshold: 0.65,
  highSolarElevationDeg: 70,
};

export class HeatAnalysisService {
  async analyzeRouteHeat(request: HeatAnalysisRequest): Promise<HeatAnalysisResult> {
    const departureDate = new Date(request.departureTime);
    if (Number.isNaN(departureDate.valueOf())) {
      throw new Error("Invalid heat-analysis timestamp.");
    }

    const routeGeometry = request.route.geometry;
    const routeMeters = routeLengthMeters(routeGeometry);
    const timedSegments = assignSegmentTraversalTimes({
      segments: segmentRouteGeometry(routeGeometry),
      departureTime: departureDate.toISOString(),
      routeDurationSeconds: request.route.durationSeconds,
    });
    const segmentHeat = timedSegments.map((segment) =>
      analyzeSegmentHeat({
        segment,
        routeMeters,
        routeDurationSeconds: request.route.durationSeconds,
        request,
      }),
    );
    const summary = summarizeRouteHeat(segmentHeat, routeMeters);

    return {
      status: "available",
      routeGeometry,
      departureTime: departureDate.toISOString(),
      segmentHeat,
      summary,
      quality: {
        temperatureAvailable: segmentHeat.some((segment) => segment.temperatureC !== null),
        apparentTemperatureAvailable: segmentHeat.some(
          (segment) => segment.apparentTemperatureC !== null || segment.heatIndexC !== null,
        ),
        humidityAvailable: segmentHeat.some((segment) => segment.relativeHumidity !== null),
        shadeAvailable: request.shadeAnalysis !== null && request.shadeAnalysis !== undefined,
        windAvailable: request.windAnalysis !== null && request.windAnalysis !== undefined,
        routeAnalysisCoverage: routeMeters > 0 ? summary.analyzedMeters / routeMeters : 0,
        overallConfidence: summary.confidence,
      },
      debug: {
        segments: heatSegmentsToFeatureCollection(timedSegments, segmentHeat),
        note:
          "Heat exposure is deterministic from normalized temperature, humidity/apparent-temperature where available, estimated building shade, solar elevation, route timing, and bounded ventilation. It is not a medical heat-risk or WBGT certification.",
      },
    };
  }
}

function analyzeSegmentHeat({
  segment,
  routeMeters,
  routeDurationSeconds,
  request,
}: {
  segment: TimedRouteSegment;
  routeMeters: number;
  routeDurationSeconds: number;
  request: HeatAnalysisRequest;
}): SegmentHeatExposure {
  const weather = selectComfortWeatherForTime(
    request.weatherBundle ?? null,
    segment.estimatedMidpointTime,
  );
  const shade = request.shadeAnalysis?.segmentShade.find(
    (value) => value.segmentId === segment.id,
  );
  const wind = request.windAnalysis?.segmentWind.find(
    (value) => value.segmentId === segment.id,
  );
  const durationSeconds =
    routeMeters > 0
      ? (segment.distanceMeters / routeMeters) * Math.max(0, routeDurationSeconds)
      : Math.max(
          0,
          (Date.parse(segment.estimatedExitTime) - Date.parse(segment.estimatedEntryTime)) /
            1000,
        );
  const temperatureC = normalizeNumber(weather.temperatureC);
  const apparentTemperatureC = normalizeNumber(weather.apparentTemperatureC);
  const relativeHumidity = normalizeNumber(weather.relativeHumidity);
  const heatTemperature = selectEffectiveHeatTemperatureC({
    temperatureC,
    apparentTemperatureC,
    relativeHumidity,
  });
  const effectiveHeatTemperatureC = heatTemperature.effectiveHeatTemperatureC;
  const heatRatio =
    effectiveHeatTemperatureC === null
      ? 0
      : clamp01(
          (effectiveHeatTemperatureC - HEAT_ENGINE_CONSTANTS.warmThresholdC) /
            (HEAT_ENGINE_CONSTANTS.severeHeatC - HEAT_ENGINE_CONSTANTS.warmThresholdC),
        );
  const shadeRatio = shade ? clamp01(shade.shadeRatio) : null;
  const solarElevationDeg = normalizeNumber(shade?.solarElevationDeg);
  const daylight = solarElevationDeg !== null && solarElevationDeg > 0;
  const directSunRatio = daylight && shadeRatio !== null ? 1 - shadeRatio : daylight ? null : 0;
  const solarElevationModifier = daylight
    ? clamp01(
        Math.sin((Math.max(0, solarElevationDeg) * Math.PI) / 180) /
          Math.sin((HEAT_ENGINE_CONSTANTS.highSolarElevationDeg * Math.PI) / 180),
      )
    : 0;
  const windExposureMps = normalizeNumber(wind?.estimatedExposureMps);
  const ambientHeatCost = heatRatio * HEAT_ENGINE_CONSTANTS.ambientHeatWeight;
  const humidityCost =
    relativeHumidity === null
      ? 0
      : clamp01((relativeHumidity - 35) / 45) *
        heatRatio *
        HEAT_ENGINE_CONSTANTS.humidityWeight;
  const solarExposureCost =
    directSunRatio === null
      ? 0
      : directSunRatio *
        solarElevationModifier *
        heatRatio *
        HEAT_ENGINE_CONSTANTS.solarExposureWeight;
  const ventilationModifier = calculateVentilationModifier({
    windExposureMps,
    effectiveHeatTemperatureC,
    heatRatio,
  });
  const totalHeatExposureCost = Math.max(
    0,
    ambientHeatCost + humidityCost + solarExposureCost + ventilationModifier,
  );
  const confidence = calculateHeatConfidence({
    weatherConfidence: weather.confidence,
    temperatureC,
    relativeHumidity,
    apparentTemperatureC,
    shadeConfidence: shade?.confidence ?? null,
    windConfidence: wind?.confidence ?? null,
  });

  return {
    segmentId: segment.id,
    timestamp: segment.estimatedMidpointTime,
    distanceMeters: segment.distanceMeters,
    durationSeconds,
    temperatureC,
    apparentTemperatureC,
    heatIndexC: heatTemperature.heatIndexC,
    effectiveHeatTemperatureC,
    relativeHumidity,
    shadeRatio,
    directSunRatio,
    solarElevationDeg,
    solarElevationModifier,
    windExposureMps,
    ventilationModifier,
    ambientHeatCost,
    humidityCost,
    solarExposureCost,
    totalHeatExposureCost,
    totalHeatExposureMinutesCost: totalHeatExposureCost * Math.max(0, durationSeconds / 60),
    confidence,
  };
}

export function calculateVentilationModifier({
  windExposureMps,
  effectiveHeatTemperatureC,
  heatRatio,
}: {
  windExposureMps?: number | null;
  effectiveHeatTemperatureC?: number | null;
  heatRatio: number;
}) {
  if (
    typeof windExposureMps !== "number" ||
    !Number.isFinite(windExposureMps) ||
    windExposureMps <= 0 ||
    typeof effectiveHeatTemperatureC !== "number" ||
    !Number.isFinite(effectiveHeatTemperatureC) ||
    heatRatio <= 0
  ) {
    return 0;
  }

  const extremeHeatReduction =
    effectiveHeatTemperatureC >= HEAT_ENGINE_CONSTANTS.extremeHeatC
      ? 0
      : effectiveHeatTemperatureC >= HEAT_ENGINE_CONSTANTS.severeHeatC
        ? 0.45
        : 1;
  return (
    -HEAT_ENGINE_CONSTANTS.maxVentilationBenefit *
    clamp01(windExposureMps / HEAT_ENGINE_CONSTANTS.ventilationFullEffectMps) *
    heatRatio *
    extremeHeatReduction
  );
}

function summarizeRouteHeat(segmentHeat: SegmentHeatExposure[], routeMeters: number) {
  const totalDurationSeconds = segmentHeat.reduce(
    (sum, segment) => sum + segment.durationSeconds,
    0,
  );
  const totalHeatExposureCost = segmentHeat.reduce(
    (sum, segment) => sum + segment.totalHeatExposureMinutesCost,
    0,
  );
  const averageHeatExposure =
    totalDurationSeconds > 0
      ? totalHeatExposureCost / Math.max(1, totalDurationSeconds / 60)
      : 0;
  const confidence = clamp01(timeWeightedAverage(segmentHeat, (segment) => segment.confidence));
  const unknownMeters = segmentHeat.reduce((sum, segment) => {
    if (segment.effectiveHeatTemperatureC === null || segment.shadeRatio === null) {
      return sum + segment.distanceMeters;
    }
    return sum;
  }, 0);
  const analyzedMeters = Math.max(0, routeMeters - unknownMeters);
  const sunnyRuns = continuousSunRuns(segmentHeat);

  return {
    analyzedMeters,
    unknownMeters,
    averageHeatExposure,
    totalHeatExposureCost,
    ambientHeatExposure: timeWeightedAverage(segmentHeat, (segment) => segment.ambientHeatCost),
    solarExposure: timeWeightedAverage(segmentHeat, (segment) => segment.solarExposureCost),
    ventilationModifier: timeWeightedAverage(segmentHeat, (segment) => segment.ventilationModifier),
    shadeRatio: distanceWeightedAverage(segmentHeat, (segment) => segment.shadeRatio ?? 0),
    directSunRatio: distanceWeightedAverage(segmentHeat, (segment) => segment.directSunRatio ?? 0),
    longestContinuousSunMeters: sunnyRuns.reduce(
      (max, run) => Math.max(max, run.meters),
      0,
    ),
    longestContinuousSunSeconds: sunnyRuns.reduce(
      (max, run) => Math.max(max, run.seconds),
      0,
    ),
    sunnyRunCount: sunnyRuns.length,
    confidence,
    completeness: routeMeters > 0 ? clamp01(analyzedMeters / routeMeters) : 0,
  };
}

function continuousSunRuns(segmentHeat: SegmentHeatExposure[]) {
  const runs: Array<{ meters: number; seconds: number }> = [];
  for (const segment of segmentHeat) {
    if ((segment.directSunRatio ?? 0) < HEAT_ENGINE_CONSTANTS.directSunRunThreshold) {
      continue;
    }
    const previous = runs[runs.length - 1];
    if (previous) {
      previous.meters += segment.distanceMeters;
      previous.seconds += segment.durationSeconds;
    } else {
      runs.push({ meters: segment.distanceMeters, seconds: segment.durationSeconds });
    }
  }
  return runs;
}

function heatSegmentsToFeatureCollection(
  segments: TimedRouteSegment[],
  segmentHeat: SegmentHeatExposure[],
): FeatureCollection<LineString> {
  return featureCollection(
    segments.map((segment) => {
      const heat = segmentHeat.find((value) => value.segmentId === segment.id);
      return feature(segment.geometry, {
        id: segment.id,
        totalHeatExposureCost: heat?.totalHeatExposureCost ?? 0,
        ambientHeatCost: heat?.ambientHeatCost ?? 0,
        solarExposureCost: heat?.solarExposureCost ?? 0,
        ventilationModifier: heat?.ventilationModifier ?? 0,
        directSunRatio: heat?.directSunRatio ?? null,
        shadeRatio: heat?.shadeRatio ?? null,
        solarElevationDeg: heat?.solarElevationDeg ?? null,
        temperatureC: heat?.temperatureC ?? null,
        effectiveHeatTemperatureC: heat?.effectiveHeatTemperatureC ?? null,
        confidence: heat?.confidence ?? 0,
      });
    }),
  );
}

function calculateHeatConfidence({
  weatherConfidence,
  temperatureC,
  relativeHumidity,
  apparentTemperatureC,
  shadeConfidence,
  windConfidence,
}: {
  weatherConfidence: number;
  temperatureC: number | null;
  relativeHumidity: number | null;
  apparentTemperatureC: number | null;
  shadeConfidence: number | null;
  windConfidence: number | null;
}) {
  const temperatureConfidence = temperatureC === null ? 0 : weatherConfidence;
  const apparentConfidence =
    apparentTemperatureC !== null || relativeHumidity !== null ? weatherConfidence : 0.45;
  const shade = shadeConfidence ?? 0;
  const wind = windConfidence ?? 0.42;
  return clamp01(
    temperatureConfidence * 0.42 + apparentConfidence * 0.18 + shade * 0.28 + wind * 0.12,
  );
}

function timeWeightedAverage(
  segments: SegmentHeatExposure[],
  selector: (segment: SegmentHeatExposure) => number,
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

function distanceWeightedAverage(
  segments: SegmentHeatExposure[],
  selector: (segment: SegmentHeatExposure) => number,
) {
  const meters = segments.reduce((sum, segment) => sum + segment.distanceMeters, 0);
  if (meters <= 0) return 0;
  return (
    segments.reduce((sum, segment) => sum + selector(segment) * segment.distanceMeters, 0) /
    meters
  );
}

function normalizeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
