import type { CandidateGenerator } from "@/lib/routing/generators/types";
import type { RouteCandidateSet, RouteRequest } from "@/lib/routing/types";
import { RoutingService } from "@/lib/routing/service";

export class OsrmAlternativeGenerator implements CandidateGenerator {
  readonly id = "osrm-alternative" as const;

  constructor(private readonly routingService: RoutingService) {}

  async generateCandidates(request: RouteRequest): Promise<RouteCandidateSet> {
    const candidateSet = await this.routingService.getWalkingRouteCandidates(request);

    return {
      ...candidateSet,
      candidates: candidateSet.candidates.map((candidate) => ({
        ...candidate,
        generation: {
          ...candidate.generation,
          generator: "osrm-alternative",
        },
      })),
    };
  }
}
