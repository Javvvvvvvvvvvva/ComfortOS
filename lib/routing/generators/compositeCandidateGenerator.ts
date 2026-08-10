import type {
  CandidateGenerationContext,
  CandidateGenerator,
} from "@/lib/routing/generators/types";
import type { RouteCandidateSet, RouteRequest } from "@/lib/routing/types";

export class CompositeCandidateGenerator implements CandidateGenerator {
  readonly id = "corridor-waypoint" as const;

  constructor(private readonly generators: CandidateGenerator[]) {}

  async generateCandidates(
    request: RouteRequest,
    context?: CandidateGenerationContext,
  ): Promise<RouteCandidateSet> {
    const mode = (request as { generationMode?: "osrm-only" | "enhanced" }).generationMode;
    const generators = mode === "osrm-only" ? this.generators.slice(0, 1) : this.generators;
    const results = await Promise.allSettled(
      generators.map((generator) => generator.generateCandidates(request, context)),
    );
    const fulfilled = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    return {
      candidates: fulfilled.flatMap((result) => result.candidates),
      provider: fulfilled.find((result) => result.provider)?.provider,
    };
  }
}
