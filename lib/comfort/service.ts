import { feature, featureCollection } from "@turf/turf";
import type { FeatureCollection, LineString } from "geojson";
import { createComfortEngine } from "@/lib/comfort/comfortEngine";
import { selectComfortWeatherForTime } from "@/lib/comfort/context";
import type {
  ComfortAnalysisRequest,
  ComfortAnalysisCompleteness,
  ComfortAnalysisResult,
  ComfortDominantFactor,
  RouteComfortCost,
  RouteComfortSummary,
  SegmentComfortInput,
  SegmentComfortResult,
} from "@/lib/comfort/types";
import { clamp01 } from "@/lib/comfort/thermal";
import {
  assignSegmentTraversalTimes,
  segmentRouteGeometry,
} from "@/lib/environment/shade/routeSegmentation";
import { routeLengthMeters } from "@/lib/environment/shade/shadeIntersectionEngine";
import type { TimedRouteSegment } from "@/lib/environment/shade/types";

export class ComfortAnalysisService {
  async analyzeRouteComfort(
    request: ComfortAnalysisRequest,
  ): Promise<ComfortAnalysisResult> {
    const departureDate = new Date(request.departureTime);
    if (Number.isNaN(departureDate.valueOf())) {
      throw new Error("Invalid comfort timestamp.");
    }

    const routeGeometry = request.route.geometry;
    const segments = segmentRouteGeometry(routeGeometry);
    const timedSegments = assignSegmentTraversalTimes({
      segments,
      departureTime: departureDate.toISOString(),
      routeDurationSeconds: request.route.durationSeconds,
    });
    const routeMeters = routeLengthMeters(routeGeometry);
    const profile = request.profile ?? "cold";
    const engine = createComfortEngine(profile);
    const inputs = buildSegmentComfortInputs(request, timedSegments);
    const segmentComfort = inputs.map((input) => engine.evaluateSegment(input));
    const completeness = calculateCompleteness({
      inputs,
      routeMeters,
      hasShadeAnalysis: Boolean(request.shadeAnalysis),
      hasWindAnalysis: Boolean(request.windAnalysis),
      hasRainAnalysis: Boolean(request.rainAnalysis),
      hasHeatAnalysis: Boolean(request.heatAnalysis),
      shadeAnalyzedMeters: request.shadeAnalysis?.summary.analyzedMeters ?? 0,
      windAnalyzedMeters: request.windAnalysis?.summary.analyzedMeters ?? 0,
      rainAnalyzedMeters: request.rainAnalysis?.summary.analyzedMeters ?? 0,
      heatAnalyzedMeters: request.heatAnalysis?.summary.analyzedMeters ?? 0,
      profile,
    });
    const summary = summarizeComfort({
      segmentComfort,
      routeMeters,
      routeDurationSeconds: request.route.durationSeconds,
      scoreFromAverageCost: (averageCost) => engine.scoreFromAverageCost(averageCost),
      scoreComparable: completeness.comparable,
    });
    const quality = {
      weatherConfidence: weightedInputAverage(inputs, (input) =>
        profile === "rain"
          ? input.weather.precipitationMmPerHour === null ||
            input.weather.precipitationMmPerHour === undefined
            ? 0
            : input.weather.confidence
          : input.weather.temperatureC === null || input.weather.temperatureC === undefined
            ? 0
            : input.weather.confidence,
      ),
      shadeConfidence: request.shadeAnalysis?.summary.confidence ?? 0,
      windConfidence: request.windAnalysis?.summary.confidence ?? 0,
      routeAnalysisCoverage:
        profile === "rain"
          ? request.rainAnalysis?.summary.completeness ?? 0
          : profile === "heat"
            ? request.heatAnalysis?.summary.completeness ?? 0
          : routeMeters > 0
            ? clamp01(
                Math.min(
                  request.shadeAnalysis
                    ? request.shadeAnalysis.summary.analyzedMeters / routeMeters
                    : routeMeters > 0
                      ? 0.72
                      : 0,
                  request.windAnalysis
                    ? request.windAnalysis.summary.analyzedMeters / routeMeters
                    : routeMeters > 0
                      ? 0.72
                      : 0,
                ),
              )
            : 0,
      overallConfidence: summary.confidence,
    };
    const routeComfortCost = buildRouteComfortCost({
      summary,
      durationSeconds: request.route.durationSeconds,
      completeness,
    });

    return {
      status: "available",
      profile,
      routeGeometry,
      departureTime: departureDate.toISOString(),
      segmentComfort,
      summary,
      completeness,
      routeComfortCost,
      quality,
      debug: {
        segments: comfortSegmentsToFeatureCollection(timedSegments, segmentComfort),
        note:
          profile === "heat"
            ? "Stage 9 Heat Comfort Cost is a deterministic Stay Cool estimate from normalized weather, estimated building shade, solar elevation, route timing, and bounded ventilation. It is not a medical heat-risk or WBGT value."
            : profile === "rain"
              ? "Stage 8 Rain Comfort Cost is a deterministic Stay Dry estimate from normalized precipitation and covered-network exposure. It is not a safety guarantee."
              : "Stage 4 Comfort Cost is a deterministic cold-profile estimate for one existing route. It is not route optimization and not a measured physiological value.",
      },
    };
  }
}

function buildSegmentComfortInputs(
  request: ComfortAnalysisRequest,
  segments: TimedRouteSegment[],
): SegmentComfortInput[] {
  const routeDurationSeconds = Math.max(0, request.route.durationSeconds);
  const routeMeters = segments.at(-1)?.endDistanceMeters ?? 0;

  return segments.map((segment) => {
    const shade = request.shadeAnalysis?.segmentShade.find(
      (value) => value.segmentId === segment.id,
    );
    const wind = request.windAnalysis?.segmentWind.find(
      (value) => value.segmentId === segment.id,
    );
    const rain = request.rainAnalysis?.segmentRain.find(
      (value) => value.segmentId === segment.id,
    );
    const heat = request.heatAnalysis?.segmentHeat.find(
      (value) => value.segmentId === segment.id,
    );
    const durationSeconds =
      routeMeters > 0
        ? (segment.distanceMeters / routeMeters) * routeDurationSeconds
        : segmentDurationSeconds(segment);

    return {
      segmentId: segment.id,
      distanceMeters: segment.distanceMeters,
      durationSeconds,
      estimatedMidpointTime: segment.estimatedMidpointTime,
      weather: selectComfortWeatherForTime(
        request.weatherBundle ?? null,
        segment.estimatedMidpointTime,
      ),
      shade: shade
        ? {
            shadeRatio: shade.shadeRatio,
            confidence: shade.confidence,
            solarElevationDeg: shade.solarElevationDeg,
          }
        : undefined,
      wind: wind
        ? {
            estimatedExposureMps: wind.estimatedWindExposureMps,
            headwindComponentMps: wind.headwindComponentMps,
            crosswindComponentMps: wind.crosswindComponentMps,
            shelterFactor: wind.shelterFactor,
            confidence: wind.confidence,
        }
        : undefined,
      rain: rain
        ? {
            estimatedRainExposure: rain.estimatedRainExposure,
            precipitationIntensityMmPerHour: rain.precipitationIntensityMmPerHour,
            precipitationProbability: rain.precipitationProbability,
            coveredRatio: rain.coveredRatio,
            windDrivenExposureFactor: rain.windDrivenExposureFactor,
            confidence: rain.confidence,
          }
        : undefined,
      heat: heat
        ? {
            totalHeatExposureCost: heat.totalHeatExposureCost,
            totalHeatExposureMinutesCost: heat.totalHeatExposureMinutesCost,
            ambientHeatCost: heat.ambientHeatCost,
            humidityCost: heat.humidityCost,
            solarExposureCost: heat.solarExposureCost,
            ventilationModifier: heat.ventilationModifier,
            shadeRatio: heat.shadeRatio,
            directSunRatio: heat.directSunRatio,
            confidence: heat.confidence,
          }
        : undefined,
    };
  });
}

function summarizeComfort({
  segmentComfort,
  routeMeters,
  routeDurationSeconds,
  scoreFromAverageCost,
  scoreComparable,
}: {
  segmentComfort: SegmentComfortResult[];
  routeMeters: number;
  routeDurationSeconds: number;
  scoreFromAverageCost: (averageComfortCost: number) => number;
  scoreComparable: boolean;
}) {
  const durationSeconds = Math.max(
    1,
    Number.isFinite(routeDurationSeconds) && routeDurationSeconds > 0
      ? routeDurationSeconds
      : segmentComfort.reduce((sum, segment) => sum + segment.durationSeconds, 0),
  );
  const durationMinutes = durationSeconds / 60;
  const totalComfortCost = segmentComfort.reduce(
    (sum, segment) => sum + segment.totalComfortCost,
    0,
  );
  const averageComfortCost = totalComfortCost / durationMinutes;
  const thermalExposure = timeWeightedAverage(segmentComfort, (segment) => segment.thermalCost);
  const windExposure = timeWeightedAverage(segmentComfort, (segment) => segment.windCost);
  const solarExposure = timeWeightedAverage(segmentComfort, (segment) => segment.solarCost);
  const rainExposure = timeWeightedAverage(segmentComfort, (segment) => segment.rainCost);
  const heatExposure = timeWeightedAverage(segmentComfort, (segment) => segment.heatCost);
  const confidence = clamp01(
    timeWeightedAverage(segmentComfort, (segment) => segment.confidence),
  );

  return {
    totalComfortCost,
    averageComfortCost,
    comfortScore: scoreComparable ? scoreFromAverageCost(averageComfortCost) : null,
    scoreStatus: scoreComparable ? "complete" : "partial",
    thermalExposure,
    windExposure,
    solarExposure,
    rainExposure,
    heatExposure,
    analyzedMeters: routeMeters,
    unknownMeters: Math.max(0, routeMeters * (1 - confidence)),
    confidence,
    dominantFactors: dominantFactors(segmentComfort),
  } satisfies RouteComfortSummary;
}

function calculateCompleteness({
  inputs,
  routeMeters,
  hasShadeAnalysis,
  hasWindAnalysis,
  hasRainAnalysis,
  hasHeatAnalysis,
  shadeAnalyzedMeters,
  windAnalyzedMeters,
  rainAnalyzedMeters,
  heatAnalyzedMeters,
  profile,
}: {
  inputs: SegmentComfortInput[];
  routeMeters: number;
  hasShadeAnalysis: boolean;
  hasWindAnalysis: boolean;
  hasRainAnalysis: boolean;
  hasHeatAnalysis: boolean;
  shadeAnalyzedMeters: number;
  windAnalyzedMeters: number;
  rainAnalyzedMeters: number;
  heatAnalyzedMeters: number;
  profile: string;
}): ComfortAnalysisCompleteness {
  const weatherWeight = 0.5;
  const windWeight = 0.35;
  const shadeWeight = 0.15;
  const rainWeight = 0.5;
  const heatWeight = 0.45;
  const weatherAvailable =
    weightedInputAverage(inputs, (input) =>
      profile === "rain"
        ? input.weather.precipitationMmPerHour === null ||
          input.weather.precipitationMmPerHour === undefined
          ? 0
          : 1
        : input.weather.temperatureC === null || input.weather.temperatureC === undefined
          ? 0
          : 1,
    ) >= 0.95;
  const windCoverage = routeMeters > 0 ? clamp01(windAnalyzedMeters / routeMeters) : 0;
  const shadeCoverage = routeMeters > 0 ? clamp01(shadeAnalyzedMeters / routeMeters) : 0;
  const rainCoverage = routeMeters > 0 ? clamp01(rainAnalyzedMeters / routeMeters) : 0;
  const heatCoverage = routeMeters > 0 ? clamp01(heatAnalyzedMeters / routeMeters) : 0;
  const windAvailable = hasWindAnalysis && windCoverage > 0;
  const shadeAvailable = hasShadeAnalysis && shadeCoverage > 0;
  const rainAvailable = hasRainAnalysis && rainCoverage > 0;
  const heatAvailable = hasHeatAnalysis && heatCoverage > 0;
  const analyzedWeight =
    profile === "rain"
      ? (weatherAvailable ? weatherWeight : 0) + rainCoverage * rainWeight
      : profile === "heat"
        ? (weatherAvailable ? 0.4 : 0) +
          heatCoverage * heatWeight +
          shadeCoverage * 0.12 +
          windCoverage * 0.03
      : (weatherAvailable ? weatherWeight : 0) +
        windCoverage * windWeight +
        shadeCoverage * shadeWeight;
  const comparable =
    profile === "rain"
      ? weatherAvailable && rainAvailable && analyzedWeight >= 0.75
      : profile === "heat"
        ? weatherAvailable && heatAvailable && shadeAvailable && analyzedWeight >= 0.75
      : weatherAvailable && windAvailable && shadeAvailable && analyzedWeight >= 0.75;

  return {
    weatherAvailable,
    windAvailable,
    shadeAvailable,
    rainAvailable,
    heatAvailable,
    weatherWeight,
    windWeight,
    shadeWeight,
    rainWeight,
    heatWeight,
    analyzedWeight: clamp01(analyzedWeight),
    comparable,
  };
}

function buildRouteComfortCost({
  summary,
  durationSeconds,
  completeness,
}: {
  summary: RouteComfortSummary;
  durationSeconds: number;
  completeness: ComfortAnalysisCompleteness;
}): RouteComfortCost {
  return {
    environmentalExposureCost: summary.totalComfortCost,
    averageEnvironmentalCost: summary.averageComfortCost,
    analyzedDurationMinutes: Math.max(0, durationSeconds / 60),
    confidence: summary.confidence,
    completeness: completeness.analyzedWeight,
    comparable: completeness.comparable,
  };
}

function dominantFactors(
  segmentComfort: SegmentComfortResult[],
): ComfortDominantFactor[] {
  const totals = new Map<ComfortDominantFactor["type"], number>();

  for (const segment of segmentComfort) {
    add(totals, "cold", segment.contributions.cold ?? 0, segment.durationSeconds);
    add(totals, "wind", segment.contributions.windExposure ?? 0, segment.durationSeconds);
    add(totals, "headwind", segment.contributions.headwind ?? 0, segment.durationSeconds);
    add(totals, "crosswind", segment.contributions.crosswind ?? 0, segment.durationSeconds);
    add(totals, "shade", segment.contributions.solarExposure ?? 0, segment.durationSeconds);
    add(totals, "rain", segment.contributions.rainExposure ?? 0, segment.durationSeconds);
    add(totals, "heat", segment.contributions.heatAmbient ?? 0, segment.durationSeconds);
    add(totals, "heat", segment.contributions.humidity ?? 0, segment.durationSeconds);
    add(totals, "sun", segment.contributions.sunExposure ?? 0, segment.durationSeconds);
  }

  const total = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];

  return Array.from(totals.entries())
    .map(([type, value]) => ({ type, contribution: value / total }))
    .filter((factor) => factor.contribution > 0.01)
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, 3);
}

function comfortSegmentsToFeatureCollection(
  segments: TimedRouteSegment[],
  comfort: SegmentComfortResult[],
): FeatureCollection<LineString> {
  return featureCollection(
    segments.map((segment) => {
      const segmentComfort = comfort.find((value) => value.segmentId === segment.id);
      return feature(segment.geometry, {
        id: segment.id,
        totalComfortCost: segmentComfort?.totalComfortCost ?? 0,
        comfortCostRate: segmentComfort?.comfortCostRate ?? 0,
        thermalCost: segmentComfort?.thermalCost ?? 0,
        windCost: segmentComfort?.windCost ?? 0,
        solarCost: segmentComfort?.solarCost ?? 0,
        rainCost: segmentComfort?.rainCost ?? 0,
        heatCost: segmentComfort?.heatCost ?? 0,
        estimatedHeatExposure: segmentComfort?.estimatedHeatExposure ?? null,
        estimatedRainExposure: segmentComfort?.estimatedRainExposure ?? null,
        confidence: segmentComfort?.confidence ?? 0,
        estimatedMidpointTime: segment.estimatedMidpointTime,
      });
    }),
  );
}

function add(
  totals: Map<ComfortDominantFactor["type"], number>,
  type: ComfortDominantFactor["type"],
  value: number,
  durationSeconds: number,
) {
  totals.set(type, (totals.get(type) ?? 0) + Math.max(0, value) * durationSeconds);
}

function timeWeightedAverage(
  segments: SegmentComfortResult[],
  selector: (segment: SegmentComfortResult) => number,
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

function weightedInputAverage(
  segments: SegmentComfortInput[],
  selector: (segment: SegmentComfortInput) => number,
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

function segmentDurationSeconds(segment: TimedRouteSegment) {
  return Math.max(
    0,
    (Date.parse(segment.estimatedExitTime) - Date.parse(segment.estimatedEntryTime)) /
      1000,
  );
}
