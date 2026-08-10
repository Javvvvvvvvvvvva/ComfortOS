import type { ComfortProfileId } from "@/lib/comfort/types";

export type ComfortWeights = {
  profile: ComfortProfileId;
  neutralTemperatureC: number;
  severeColdTemperatureC: number;
  temperature: number;
  estimatedWindChill: number;
  windExposure: number;
  headwind: number;
  crosswind: number;
  winterSunBenefit: number;
  scoreCostScale: number;
};

export const COLD_COMFORT_WEIGHTS: ComfortWeights = {
  profile: "cold",
  neutralTemperatureC: 10,
  severeColdTemperatureC: -25,
  temperature: 3.0,
  estimatedWindChill: 1.15,
  windExposure: 1.55,
  headwind: 0.9,
  crosswind: 0.45,
  winterSunBenefit: 0.35,
  scoreCostScale: 4.5,
};

export function weightsForProfile(profile: ComfortProfileId = "cold") {
  if (profile !== "cold") return COLD_COMFORT_WEIGHTS;
  return COLD_COMFORT_WEIGHTS;
}
