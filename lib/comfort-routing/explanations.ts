import type { AnalyzedRouteCandidate } from "@/lib/comfort-routing/types";

export type RouteExplanation = {
  label: string;
  priority: number;
};

export const ROUTE_EXPLANATION_THRESHOLDS = {
  environmentalReductionRatio: 0.08,
  windReductionMps: 0.35,
  headwindReductionMps: 0.25,
  shadeDifferenceRatio: 0.12,
};

export function explainComfortRoute({
  fastest,
  comfort,
}: {
  fastest: AnalyzedRouteCandidate;
  comfort: AnalyzedRouteCandidate;
}): RouteExplanation[] {
  const explanations: RouteExplanation[] = [];
  const environmentalReduction = comfort.metrics.environmentalCostReductionRatio;
  if (environmentalReduction >= ROUTE_EXPLANATION_THRESHOLDS.environmentalReductionRatio) {
    explanations.push({
      label: `${Math.round(environmentalReduction * 100)}% lower environmental exposure`,
      priority: 50 + environmentalReduction * 100,
    });
  }

  const fastestWind = fastest.windAnalysis?.summary.averageEstimatedExposureMps;
  const comfortWind = comfort.windAnalysis?.summary.averageEstimatedExposureMps;
  if (fastestWind !== undefined && comfortWind !== undefined) {
    const windReduction = fastestWind - comfortWind;
    if (windReduction >= ROUTE_EXPLANATION_THRESHOLDS.windReductionMps) {
      explanations.push({
        label: `${Math.round((windReduction / Math.max(0.1, fastestWind)) * 100)}% lower estimated wind exposure`,
        priority: 40 + windReduction,
      });
    }
  }

  const fastestHeadwind = fastest.windAnalysis?.summary.averageHeadwindMps;
  const comfortHeadwind = comfort.windAnalysis?.summary.averageHeadwindMps;
  if (fastestHeadwind !== undefined && comfortHeadwind !== undefined) {
    const headwindReduction = fastestHeadwind - comfortHeadwind;
    if (headwindReduction >= ROUTE_EXPLANATION_THRESHOLDS.headwindReductionMps) {
      explanations.push({
        label: "Less headwind",
        priority: 30 + headwindReduction,
      });
    }
  }

  const fastestShade = fastest.shadeAnalysis?.summary.shadeRatio;
  const comfortShade = comfort.shadeAnalysis?.summary.shadeRatio;
  if (fastestShade !== undefined && comfortShade !== undefined) {
    const shadeDifference = comfortShade - fastestShade;
    if (Math.abs(shadeDifference) >= ROUTE_EXPLANATION_THRESHOLDS.shadeDifferenceRatio) {
      explanations.push({
        label: shadeDifference < 0 ? "More winter sun" : "More estimated building shade",
        priority: 20 + Math.abs(shadeDifference),
      });
    }
  }

  return explanations.sort((left, right) => right.priority - left.priority).slice(0, 3);
}
