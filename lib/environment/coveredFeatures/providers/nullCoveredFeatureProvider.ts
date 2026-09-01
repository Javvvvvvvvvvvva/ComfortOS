import type {
  CoveredFeatureProvider,
  CoveredFeatureProviderResult,
} from "@/lib/environment/coveredFeatures/types";

export class NullCoveredFeatureProvider implements CoveredFeatureProvider {
  async getCoveredFeatures(): Promise<CoveredFeatureProviderResult> {
    return {
      features: [],
      metadata: {
        provider: "None",
        source: "none",
        mode: "disabled",
      },
    };
  }
}
