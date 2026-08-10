import { type ComfortWeights, weightsForProfile } from "@/lib/comfort/weights";
import type {
  ComfortProfileId,
  SegmentComfortInput,
  SegmentComfortResult,
} from "@/lib/comfort/types";
import {
  calculateEstimatedPedestrianWindChill,
  clamp01,
  coldStressRatio,
} from "@/lib/comfort/thermal";

export class ComfortEngine {
  constructor(private readonly weights: ComfortWeights = weightsForProfile("cold")) {}

  evaluateSegment(input: SegmentComfortInput): SegmentComfortResult {
    const temperatureC = firstNumber(
      input.weather.apparentTemperatureC,
      input.weather.temperatureC,
    );
    const windExposureMps = input.wind?.estimatedExposureMps ?? null;
    const windChill = calculateEstimatedPedestrianWindChill({
      temperatureC,
      pedestrianWindExposureMps: windExposureMps,
    });
    const coldRatio = coldStressRatio({
      temperatureC,
      neutralTemperatureC: this.weights.neutralTemperatureC,
      severeColdTemperatureC: this.weights.severeColdTemperatureC,
    });
    const cold = coldRatio === null ? 0 : coldRatio * this.weights.temperature;
    const windChillPenalty =
      windChill.windChillC !== null && temperatureC !== null
        ? clamp01((temperatureC - windChill.windChillC) / 15) *
          this.weights.estimatedWindChill
        : 0;
    const exposure = windExposureMps === null ? 0 : clamp01(windExposureMps / 10) * this.weights.windExposure;
    const headwind =
      input.wind === undefined
        ? 0
        : clamp01(input.wind.headwindComponentMps / 8) * this.weights.headwind;
    const crosswind =
      input.wind === undefined
        ? 0
        : clamp01(input.wind.crosswindComponentMps / 8) * this.weights.crosswind;
    const solarBenefit = this.calculateWinterSunBenefit(input, coldRatio ?? 0);
    const thermalCost = cold + windChillPenalty;
    const windCost = exposure + headwind + crosswind;
    const solarCost = solarBenefit > 0 ? -solarBenefit : 0;
    const comfortCostRate = Math.max(0, thermalCost + windCost + solarCost);
    const durationMinutes = Math.max(0, input.durationSeconds / 60);

    return {
      segmentId: input.segmentId,
      estimatedMidpointTime: input.estimatedMidpointTime,
      distanceMeters: input.distanceMeters,
      durationSeconds: input.durationSeconds,
      temperatureC,
      estimatedPedestrianWindChillC: windChill.windChillC,
      shadeRatio: input.shade?.shadeRatio ?? null,
      estimatedWindExposureMps: windExposureMps,
      thermalCost,
      windCost,
      solarCost,
      comfortCostRate,
      totalComfortCost: comfortCostRate * durationMinutes,
      contributions: {
        cold,
        estimatedWindChill: windChillPenalty,
        windExposure: exposure,
        headwind,
        crosswind,
        solarExposure:
          input.shade && coldRatio !== null
            ? input.shade.shadeRatio * coldRatio * this.weights.winterSunBenefit
            : undefined,
        winterSunBenefit: solarBenefit > 0 ? -solarBenefit : 0,
      },
      confidence: this.segmentConfidence(input),
    };
  }

  scoreFromAverageCost(averageComfortCost: number) {
    const boundedCost = Math.max(0, Number.isFinite(averageComfortCost) ? averageComfortCost : 0);
    return Math.round(100 * Math.exp(-boundedCost / this.weights.scoreCostScale));
  }

  private calculateWinterSunBenefit(input: SegmentComfortInput, coldRatio: number) {
    if (!input.shade) return 0;
    if ((input.shade.solarElevationDeg ?? 0) <= 0) return 0;
    if (coldRatio <= 0) return 0;
    const sunExposureRatio = 1 - clamp01(input.shade.shadeRatio);
    return sunExposureRatio * coldRatio * input.shade.confidence * this.weights.winterSunBenefit;
  }

  private segmentConfidence(input: SegmentComfortInput) {
    const weatherConfidence =
      input.weather.temperatureC !== null && input.weather.temperatureC !== undefined
        ? input.weather.confidence
        : 0;
    const shadeConfidence = input.shade ? input.shade.confidence : 0;
    const windConfidence = input.wind ? input.wind.confidence : 0;

    return clamp01(
      weatherConfidence * 0.5 +
        windConfidence * 0.28 +
        shadeConfidence * 0.14 +
        0.08,
    );
  }
}

export function createComfortEngine(profile: ComfortProfileId = "cold") {
  return new ComfortEngine(weightsForProfile(profile));
}

function firstNumber(...values: Array<number | null | undefined>) {
  return values.find((value) => typeof value === "number" && Number.isFinite(value)) ?? null;
}
