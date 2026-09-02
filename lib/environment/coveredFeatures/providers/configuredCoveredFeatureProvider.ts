import { NullCoveredFeatureProvider } from "@/lib/environment/coveredFeatures/providers/nullCoveredFeatureProvider";
import { StaticCoveredFeatureProvider } from "@/lib/environment/coveredFeatures/providers/staticCoveredFeatureProvider";
import { HttpCoveredFeatureProvider } from "@/lib/environment/coveredFeatures/providers/httpCoveredFeatureProvider";
import type { CoveredFeatureProvider } from "@/lib/environment/coveredFeatures/types";

export type CoveredFeatureProviderMode = "disabled" | "static-osm" | "covered-query-service";

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

  if (mode === "covered-query-service") {
    const baseUrl = process.env.COVERED_FEATURE_QUERY_SERVICE_URL;
    if (!baseUrl) {
      throw new Error(
        "COVERED_FEATURE_QUERY_SERVICE_URL is required when COVERED_FEATURE_PROVIDER=covered-query-service.",
      );
    }
    return {
      provider: new HttpCoveredFeatureProvider({
        baseUrl,
        authToken: process.env.COVERED_FEATURE_QUERY_SERVICE_TOKEN,
        requestTimeoutMs: parsePositiveInteger(
          process.env.COVERED_FEATURE_QUERY_SERVICE_TIMEOUT_MS,
          5_000,
        ),
        maxResponseBytes: parsePositiveInteger(
          process.env.COVERED_FEATURE_QUERY_SERVICE_MAX_RESPONSE_BYTES,
          2 * 1024 * 1024,
        ),
        maxFeatures: parsePositiveInteger(
          process.env.COVERED_FEATURE_QUERY_SERVICE_MAX_FEATURES,
          10_000,
        ),
      }),
      mode,
    };
  }

  return {
    provider: new NullCoveredFeatureProvider(),
    mode: "disabled",
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
