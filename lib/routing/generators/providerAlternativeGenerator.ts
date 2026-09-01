import type {
  CandidateGenerationContext,
  CandidateGenerator,
} from "@/lib/routing/generators/types";
import type { RouteCandidateSet, RouteRequest } from "@/lib/routing/types";
import { RoutingService } from "@/lib/routing/service";

export class ProviderAlternativeGenerator implements CandidateGenerator {
  readonly id = "provider-alternative" as const;

  constructor(private readonly routingService: RoutingService) {}

  async generateCandidates(
    request: RouteRequest,
    context?: CandidateGenerationContext,
  ): Promise<RouteCandidateSet> {
    const candidateSet = await this.routingService.getWalkingRouteCandidates(request, {
      signal: context?.signal,
      usageCategory: "candidate",
      usageMetrics: context?.usageMetrics,
    });

    return {
      ...candidateSet,
      candidates: candidateSet.candidates.map((candidate) => ({
        ...candidate,
        generation: {
          ...candidate.generation,
          generator: "provider-alternative",
        },
      })),
    };
  }
}
