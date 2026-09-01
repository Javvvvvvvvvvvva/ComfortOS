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
    const mode = (
      request as { generationMode?: "provider-only" | "osrm-only" | "enhanced" }
    ).generationMode;
    const generators =
      mode === "provider-only" || mode === "osrm-only"
        ? this.generators.slice(0, 1)
        : this.generators;
    const results = await Promise.allSettled(
      generators.map(async (generator) => {
        const startedAt = performance.now();
        try {
          return await generator.generateCandidates(request, context);
        } finally {
          context?.diagnostics?.recordStage?.(
            `candidateGeneration.${generator.id}`,
            performance.now() - startedAt,
          );
        }
      }),
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
