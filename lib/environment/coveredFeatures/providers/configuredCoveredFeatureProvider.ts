import { NullCoveredFeatureProvider } from "@/lib/environment/coveredFeatures/providers/nullCoveredFeatureProvider";
import { StaticCoveredFeatureProvider } from "@/lib/environment/coveredFeatures/providers/staticCoveredFeatureProvider";
import type { CoveredFeatureProvider } from "@/lib/environment/coveredFeatures/types";

export type CoveredFeatureProviderMode = "disabled" | "static-osm";

export type ConfiguredCoveredFeatureProvider = {
  provider: CoveredFeatureProvider;
  mode: CoveredFeatureProviderMode;
};

export function createConfiguredCoveredFeatureProvider(): ConfiguredCoveredFeatureProvider {
  const mode = process.env.COVERED_FEATURE_PROVIDER as CoveredFeatureProviderMode | undefined;

  if (mode === "static-osm") {
    const filePath = process.env.COVERED_FEATURE_STATIC_GEOJSON;
    if (!filePath) {
      throw new Error(
        "COVERED_FEATURE_STATIC_GEOJSON is required when COVERED_FEATURE_PROVIDER=static-osm.",
      );
    }
    return {
      provider: new StaticCoveredFeatureProvider({
        filePath,
        region: process.env.COVERED_FEATURE_REGION,
      }),
      mode,
    };
  }

  return {
    provider: new NullCoveredFeatureProvider(),
    mode: "disabled",
  };
}
