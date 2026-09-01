import { GeocodingProviderConfigurationError } from "@/lib/geocoding/errors";
import { MapboxSearchBoxProvider } from "@/lib/geocoding/providers/mapboxSearchBoxProvider";
import { PhotonGeocodingProvider } from "@/lib/geocoding/providers/photonProvider";
import type {
  GeocodingProvider,
  GeocodingProviderMetadata,
} from "@/lib/geocoding/types";

const PUBLIC_PHOTON_BASE_URL = "https://photon.komoot.io";

export type GeocodingProviderConfigMode =
  | "photon-public"
  | "photon-self-hosted"
  | "mapbox-managed";

export type ConfiguredGeocodingProvider = {
  provider: GeocodingProvider;
  metadata: GeocodingProviderMetadata;
  mode: GeocodingProviderConfigMode;
};

export function createConfiguredGeocodingProvider(
  env: NodeJS.ProcessEnv = process.env,
): ConfiguredGeocodingProvider {
  const mode = parseMode(env.GEOCODING_PROVIDER);
  if (mode === "mapbox-managed") {
    const provider = new MapboxSearchBoxProvider({
      accessToken: env.MAPBOX_SEARCH_ACCESS_TOKEN ?? env.MAPBOX_ACCESS_TOKEN ?? "",
      baseUrl: env.MAPBOX_SEARCH_BASE_URL,
      countryCode: env.GEOCODING_COUNTRY_CODE ?? "US",
      language: env.GEOCODING_LANGUAGE ?? "en",
      requestTimeoutMs: parsePositiveInteger(env.GEOCODING_REQUEST_TIMEOUT_MS, 8_000),
    });
    return {
      provider,
      mode,
      metadata: {
        id: "mapbox-search-box",
        name: "Mapbox",
        mode: "managed",
        endpointFamily: "Search Box API v1",
        productionEligible: true,
      },
    };
  }

  const baseUrl = resolvePhotonBaseUrl(mode, env);
  assertPublicDemoAllowed(mode, env);
  return {
    provider: new PhotonGeocodingProvider({
      baseUrl,
      countryCode: env.GEOCODING_COUNTRY_CODE ?? "US",
    }),
    mode,
    metadata: {
      id: mode === "photon-public" ? "photon-public" : "photon-self-hosted",
      name: "Photon",
      mode: mode === "photon-public" ? "public-demo" : "self-hosted",
      endpointFamily: "Photon API",
      productionEligible: mode === "photon-self-hosted",
    },
  };
}

function parseMode(value: string | undefined): GeocodingProviderConfigMode {
  if (!value) return "photon-public";
  if (
    value === "photon-public" ||
    value === "photon-self-hosted" ||
    value === "mapbox-managed"
  ) {
    return value;
  }
  throw new GeocodingProviderConfigurationError(
    `Unsupported GEOCODING_PROVIDER "${value}". Use photon-public, photon-self-hosted, or mapbox-managed.`,
  );
}

function resolvePhotonBaseUrl(
  mode: GeocodingProviderConfigMode,
  env: NodeJS.ProcessEnv,
) {
  if (mode === "photon-public") {
    return (env.GEOCODING_BASE_URL ?? PUBLIC_PHOTON_BASE_URL).replace(/\/$/, "");
  }
  if (env.GEOCODING_BASE_URL) return env.GEOCODING_BASE_URL.replace(/\/$/, "");
  throw new GeocodingProviderConfigurationError(
    "photon-self-hosted requires GEOCODING_BASE_URL. Public Photon is never an implicit fallback.",
  );
}

function assertPublicDemoAllowed(
  mode: GeocodingProviderConfigMode,
  env: NodeJS.ProcessEnv,
) {
  const productionRuntime =
    env.NODE_ENV === "production" || env.COMFORTOS_ENV === "production";
  if (
    productionRuntime &&
    mode === "photon-public" &&
    env.GEOCODING_ALLOW_PUBLIC_DEMO_IN_PRODUCTION !== "true"
  ) {
    throw new GeocodingProviderConfigurationError(
      "Public Photon geocoding is not production eligible. Configure managed or self-hosted geocoding.",
    );
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}
