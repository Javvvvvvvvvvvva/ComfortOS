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
  rainExposure: number;
  uncoveredRainExposure: number;
  windDrivenRain: number;
  snowfallExposure: number;
  iceAccumulation: number;
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
  rainExposure: 0,
  uncoveredRainExposure: 0,
  windDrivenRain: 0,
  snowfallExposure: 0,
  iceAccumulation: 0,
  scoreCostScale: 4.5,
};

export const RAIN_COMFORT_WEIGHTS: ComfortWeights = {
  profile: "rain",
  neutralTemperatureC: 10,
  severeColdTemperatureC: -25,
  temperature: 0,
  estimatedWindChill: 0,
  windExposure: 0,
  headwind: 0,
  crosswind: 0,
  winterSunBenefit: 0,
  rainExposure: 2.8,
  uncoveredRainExposure: 1.15,
  windDrivenRain: 0.8,
  snowfallExposure: 0,
  iceAccumulation: 0,
  scoreCostScale: 5.25,
};

export const HEAT_COMFORT_WEIGHTS: ComfortWeights = {
  profile: "heat",
  neutralTemperatureC: 26,
  severeColdTemperatureC: -25,
  temperature: 0,
  estimatedWindChill: 0,
  windExposure: 0,
  headwind: 0,
  crosswind: 0,
  winterSunBenefit: 0,
  rainExposure: 0,
  uncoveredRainExposure: 0,
  windDrivenRain: 0,
  snowfallExposure: 0,
  iceAccumulation: 0,
  scoreCostScale: 5.75,
};

export const BALANCED_COMFORT_WEIGHTS: ComfortWeights = {
  profile: "balanced",
  neutralTemperatureC: 10,
  severeColdTemperatureC: -25,
  temperature: 0,
  estimatedWindChill: 0,
  windExposure: 0.65,
  headwind: 0.35,
  crosswind: 0.2,
  winterSunBenefit: 0,
  rainExposure: 0,
  uncoveredRainExposure: 0,
  windDrivenRain: 0,
  snowfallExposure: 0,
  iceAccumulation: 0,
  scoreCostScale: 4.5,
};

export const SNOW_COMFORT_WEIGHTS: ComfortWeights = {
  profile: "snow",
  neutralTemperatureC: 8,
  severeColdTemperatureC: -25,
  temperature: 2.2,
  estimatedWindChill: 1.1,
  windExposure: 1.35,
  headwind: 0.75,
  crosswind: 0.4,
  winterSunBenefit: 0.2,
  rainExposure: 0,
  uncoveredRainExposure: 0,
  windDrivenRain: 0,
  snowfallExposure: 2.4,
  iceAccumulation: 2.8,
  scoreCostScale: 5.5,
};

export function weightsForProfile(profile: ComfortProfileId = "cold") {
  if (profile === "rain") return RAIN_COMFORT_WEIGHTS;
  if (profile === "heat") return HEAT_COMFORT_WEIGHTS;
  if (profile === "snow") return SNOW_COMFORT_WEIGHTS;
  if (profile === "balanced") return BALANCED_COMFORT_WEIGHTS;
  return COLD_COMFORT_WEIGHTS;
}
