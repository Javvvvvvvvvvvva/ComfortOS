export type ComfortRouteRerankingPolicy = {
  maxExtraDurationSeconds: number;
  maxExtraDurationRatio: number;
  maxExtraDistanceRatio: number;
  minEnvironmentalCostReductionRatio: number;
};

export const DEFAULT_COMFORT_ROUTE_RERANKING_POLICY: ComfortRouteRerankingPolicy = {
  maxExtraDurationSeconds: 5 * 60,
  maxExtraDurationRatio: 0.35,
  maxExtraDistanceRatio: 0.35,
  minEnvironmentalCostReductionRatio: 0.08,
};
