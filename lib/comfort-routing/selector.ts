import { ROUTE_CANDIDATE_DEDUPLICATION } from "@/lib/routing/candidates";
import type { ComfortRouteRerankingPolicy } from "@/lib/comfort-routing/policy";
import { DEFAULT_COMFORT_ROUTE_RERANKING_POLICY } from "@/lib/comfort-routing/policy";
import type {
  AnalyzedRouteCandidate,
  ComfortRouteComparisonDebug,
  ComfortRouteComparisonResult,
  RouteCandidateComparisonMetrics,
} from "@/lib/comfort-routing/types";
import { calculateCandidateDiversity } from "@/lib/routing/candidates";

export function selectComfortRouteComparison({
  candidates,
  policy = DEFAULT_COMFORT_ROUTE_RERANKING_POLICY,
  provider,
  performanceMs,
  generation,
  buildings,
  coveredFeatures,
  routingProvider,
  routingUsage,
  capabilities,
  context,
}: {
  candidates: Omit<AnalyzedRouteCandidate, "role" | "metrics">[];
  policy?: ComfortRouteRerankingPolicy;
  provider?: ComfortRouteComparisonResult["provider"];
  performanceMs?: ComfortRouteComparisonDebug["performanceMs"];
  generation?: ComfortRouteComparisonDebug["generation"];
  buildings?: ComfortRouteComparisonDebug["buildings"];
  coveredFeatures?: ComfortRouteComparisonDebug["coveredFeatures"];
  routingProvider?: ComfortRouteComparisonDebug["routingProvider"];
  routingUsage?: ComfortRouteComparisonDebug["routingUsage"];
  capabilities?: ComfortRouteComparisonDebug["capabilities"];
  context?: ComfortRouteComparisonDebug["context"];
}): ComfortRouteComparisonResult {
  if (candidates.length === 0) {
    throw new Error("Route comparison requires at least one candidate.");
  }

  const fastestBase = [...candidates].sort(
    (left, right) => left.route.durationSeconds - right.route.durationSeconds,
  )[0];
  const fastestCost =
    fastestBase.comfortAnalysis?.routeComfortCost.comparable === true
      ? fastestBase.comfortAnalysis.routeComfortCost.environmentalExposureCost
      : null;

  const candidatesWithMetrics = candidates.map((candidate) => ({
    ...candidate,
    metrics: buildCandidateMetrics(candidate, fastestBase, fastestCost, policy),
  }));
  const comfortBase = chooseComfortCandidate(candidatesWithMetrics, fastestBase, fastestCost);
  const fastestAndComfort = fastestBase.id === comfortBase.id;

  const analyzed = candidatesWithMetrics.map((candidate) => {
    const role =
      candidate.id === fastestBase.id && fastestAndComfort
        ? "fastest-and-comfort"
        : candidate.id === fastestBase.id
          ? "fastest"
          : candidate.id === comfortBase.id
            ? "comfort"
            : "alternative";

    return {
      ...candidate,
      role,
    } satisfies AnalyzedRouteCandidate;
  });
  const fastest = analyzed.find((candidate) => candidate.id === fastestBase.id);
  const comfort = analyzed.find((candidate) => candidate.id === comfortBase.id);

  if (!fastest || !comfort) {
    throw new Error("Route comparison selection failed.");
  }

  return {
    fastest,
    comfort,
    candidates: analyzed,
    policy,
    provider,
    debug: buildDebug(
      analyzed,
      performanceMs,
      generation,
      buildings,
      coveredFeatures,
      routingProvider,
      routingUsage,
      capabilities,
      context,
    ),
  };
}

function chooseComfortCandidate(
  candidates: Array<Omit<AnalyzedRouteCandidate, "role">>,
  fastest: Omit<AnalyzedRouteCandidate, "role" | "metrics">,
  fastestCost: number | null,
) {
  if (fastestCost === null) return fastest;

  const eligible = candidates
    .filter(
      (candidate) =>
        candidate.comfortAnalysis?.routeComfortCost.comparable === true &&
        candidate.metrics.detourEligible &&
        (candidate.id === fastest.id || candidate.metrics.meaningfulImprovement),
    )
    .sort((left, right) => {
      const leftCost = left.comfortAnalysis?.routeComfortCost.environmentalExposureCost ?? Infinity;
      const rightCost = right.comfortAnalysis?.routeComfortCost.environmentalExposureCost ?? Infinity;
      if (Math.abs(leftCost - rightCost) > 0.0001) return leftCost - rightCost;
      return left.route.durationSeconds - right.route.durationSeconds;
    });

  return eligible[0] ?? fastest;
}

function buildCandidateMetrics(
  candidate: Omit<AnalyzedRouteCandidate, "role" | "metrics">,
  fastest: Omit<AnalyzedRouteCandidate, "role" | "metrics">,
  fastestCost: number | null,
  policy: ComfortRouteRerankingPolicy,
): RouteCandidateComparisonMetrics {
  const diversity = calculateCandidateDiversity(candidate.route, fastest.route);
  const extraDurationSeconds = Math.max(
    0,
    candidate.route.durationSeconds - fastest.route.durationSeconds,
  );
  const extraDistanceMeters = Math.max(
    0,
    candidate.route.distanceMeters - fastest.route.distanceMeters,
  );
  const durationRatio =
    fastest.route.durationSeconds > 0
      ? extraDurationSeconds / fastest.route.durationSeconds
      : 0;
  const distanceRatio =
    fastest.route.distanceMeters > 0 ? extraDistanceMeters / fastest.route.distanceMeters : 0;
  const cost = candidate.comfortAnalysis?.routeComfortCost;
  const environmentalCostReductionRatio =
    fastestCost !== null && fastestCost > 0 && cost?.comparable
      ? Math.max(0, (fastestCost - cost.environmentalExposureCost) / fastestCost)
      : candidate.id === fastest.id && cost?.comparable
        ? 0
        : 0;
  const detourEligible =
    candidate.id === fastest.id ||
    (extraDurationSeconds <= policy.maxExtraDurationSeconds &&
      durationRatio <= policy.maxExtraDurationRatio &&
      distanceRatio <= policy.maxExtraDistanceRatio);
  const meaningfulImprovement =
    candidate.id === fastest.id ||
    environmentalCostReductionRatio >= policy.minEnvironmentalCostReductionRatio;

  return {
    routeOverlapRatio: candidate.routeOverlapRatio,
    overlapWithFastest: diversity.overlapWithFastest,
    uniqueMeters: diversity.uniqueMeters,
    maxLateralSeparationMeters: diversity.maxLateralSeparationMeters,
    extraDurationSeconds,
    extraDistanceMeters,
    environmentalCostReductionRatio,
    detourEligible,
    meaningfulImprovement,
  };
}

function buildDebug(
  candidates: AnalyzedRouteCandidate[],
  performanceMs?: ComfortRouteComparisonDebug["performanceMs"],
  generation?: ComfortRouteComparisonDebug["generation"],
  buildings?: ComfortRouteComparisonDebug["buildings"],
  coveredFeatures?: ComfortRouteComparisonDebug["coveredFeatures"],
  routingProvider?: ComfortRouteComparisonDebug["routingProvider"],
  routingUsage?: ComfortRouteComparisonDebug["routingUsage"],
  capabilities?: ComfortRouteComparisonDebug["capabilities"],
  context?: ComfortRouteComparisonDebug["context"],
): ComfortRouteComparisonDebug {
  return {
    note:
      "Stage 5 reranks normalized walking-route candidates with audited raw Comfort Cost. Rounded Comfort Score never drives route selection.",
    deduplication: {
      overlapRatioThreshold: ROUTE_CANDIDATE_DEDUPLICATION.overlapRatioThreshold,
    },
    ...(generation ? { generation } : {}),
    ...(performanceMs ? { performanceMs } : {}),
    ...(buildings ? { buildings } : {}),
    ...(coveredFeatures ? { coveredFeatures } : {}),
    ...(routingProvider ? { routingProvider } : {}),
    ...(routingUsage ? { routingUsage } : {}),
    ...(capabilities ? { capabilities } : {}),
    ...(context ? { context } : {}),
    candidates: candidates.map((candidate) => {
      const cost = candidate.comfortAnalysis?.routeComfortCost;
      const rainSummary = candidate.rainAnalysis?.summary;
      const heatSummary = candidate.heatAnalysis?.summary;

      return {
        id: candidate.id,
        durationSeconds: candidate.route.durationSeconds,
        distanceMeters: candidate.route.distanceMeters,
        routeOverlapRatio: candidate.metrics.routeOverlapRatio,
        overlapWithFastest: candidate.metrics.overlapWithFastest,
        uniqueMeters: candidate.metrics.uniqueMeters,
        maxLateralSeparationMeters: candidate.metrics.maxLateralSeparationMeters,
        generator: candidate.route.generation?.generator ?? "unknown",
        waypoint: candidate.route.generation?.waypoint,
        rawEnvironmentalCost: cost?.environmentalExposureCost ?? null,
        comfortScore: candidate.comfortAnalysis?.summary.comfortScore ?? null,
        rainExposure: rainSummary?.averageRainExposure ?? null,
        coveredMeters: rainSummary?.coveredMeters ?? null,
        coveredRatio:
          rainSummary && rainSummary.analyzedMeters > 0
            ? rainSummary.coveredMeters / rainSummary.analyzedMeters
            : null,
        longestContinuousCoveredMeters:
          rainSummary?.longestContinuousCoveredMeters ?? null,
        coveredSegmentCount: rainSummary?.coveredSegmentCount ?? null,
        rainConfidence: rainSummary?.confidence ?? null,
        heatExposure: heatSummary?.averageHeatExposure ?? null,
        directSunRatio: heatSummary?.directSunRatio ?? null,
        longestContinuousSunMeters: heatSummary?.longestContinuousSunMeters ?? null,
        longestContinuousSunSeconds: heatSummary?.longestContinuousSunSeconds ?? null,
        heatConfidence: heatSummary?.confidence ?? null,
        confidence: cost?.confidence ?? 0,
        completeness: cost?.completeness ?? 0,
        comparable: cost?.comparable ?? false,
        detourEligible: candidate.metrics.detourEligible,
        meaningfulImprovement: candidate.metrics.meaningfulImprovement,
        selectedRole: candidate.role,
      };
    }),
  };
}
