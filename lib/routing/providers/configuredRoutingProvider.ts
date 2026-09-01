import {
  inferOsrmMetadata,
  OsrmWalkingProvider,
} from "@/lib/routing/providers/osrmWalkingProvider";
import { RoutingProviderConfigurationError } from "@/lib/routing/errors";
import { MapboxWalkingRoutingProvider } from "@/lib/routing/providers/mapboxWalkingRoutingProvider";
import type { RoutingProvider, RoutingProviderMetadata } from "@/lib/routing/types";

const PUBLIC_OSRM_BASE_URL = "https://routing.openstreetmap.de/routed-foot";

export type RoutingProviderConfigMode =
  | "osrm-public"
  | "osrm-self-hosted"
  | "osrm-managed"
  | "mapbox-managed";

export type ConfiguredRoutingProvider = {
  provider: RoutingProvider;
  metadata: RoutingProviderMetadata;
  mode: RoutingProviderConfigMode;
};

export function createConfiguredRoutingProvider(
  env: NodeJS.ProcessEnv = process.env,
): ConfiguredRoutingProvider {
  const mode = parseRoutingProviderMode(env.ROUTING_PROVIDER);
  if (mode === "mapbox-managed") {
    const provider = new MapboxWalkingRoutingProvider({
      accessToken: env.MAPBOX_ACCESS_TOKEN ?? "",
      baseUrl: env.MAPBOX_DIRECTIONS_BASE_URL,
      requestTimeoutMs: parsePositiveInteger(env.ROUTING_REQUEST_TIMEOUT_MS, 8_000),
      walkwayBias: parseOptionalNumber(env.MAPBOX_WALKWAY_BIAS),
    });
    const metadata = provider.getMetadata();
    assertProductionRoutingEligibility(mode, metadata, env);
    return { provider, metadata, mode };
  }

  const baseUrl = resolveBaseUrl(mode, env);
  const inferredMetadata = inferOsrmMetadata(baseUrl);
  const metadata: RoutingProviderMetadata = {
    ...inferredMetadata,
    id: env.ROUTING_PROVIDER_ID ?? inferredMetadata.id,
    name: env.ROUTING_PROVIDER_NAME ?? inferredMetadata.name,
    mode:
      mode === "osrm-public"
        ? "public-demo"
        : mode === "osrm-self-hosted"
          ? "self-hosted"
          : "managed",
    profile: "foot",
    baseUrl,
    endpointFamily: inferredMetadata.endpointFamily,
    productionEligible:
      mode !== "osrm-public" && env.ROUTING_PROVIDER_PRODUCTION_ELIGIBLE !== "false",
  };

  assertProductionRoutingEligibility(mode, metadata, env);

  return {
    provider: new OsrmWalkingProvider({
      baseUrl,
      requestTimeoutMs: parsePositiveInteger(env.ROUTING_REQUEST_TIMEOUT_MS, 8_000),
      metadata,
    }),
    metadata,
    mode,
  };
}

function parseRoutingProviderMode(value: string | undefined): RoutingProviderConfigMode {
  if (!value) return "osrm-public";
  if (
    value === "osrm-public" ||
    value === "osrm-self-hosted" ||
    value === "osrm-managed" ||
    value === "mapbox-managed"
  ) {
    return value;
  }
  throw new RoutingProviderConfigurationError(
    `Unsupported ROUTING_PROVIDER "${value}". Use osrm-public, osrm-self-hosted, osrm-managed, or mapbox-managed.`,
  );
}

function resolveBaseUrl(mode: RoutingProviderConfigMode, env: NodeJS.ProcessEnv) {
  const configured = env.ROUTING_OSRM_BASE_URL ?? env.ROUTING_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (mode === "osrm-public") return PUBLIC_OSRM_BASE_URL;
  throw new RoutingProviderConfigurationError(
    `${mode} requires ROUTING_OSRM_BASE_URL or ROUTING_BASE_URL. ComfortOS must not silently fall back to the public demo provider.`,
  );
}

function assertProductionRoutingEligibility(
  mode: RoutingProviderConfigMode,
  metadata: RoutingProviderMetadata,
  env: NodeJS.ProcessEnv,
) {
  const productionRuntime =
    env.NODE_ENV === "production" || env.COMFORTOS_ENV === "production";
  const explicitlyAllowed =
    env.ROUTING_ALLOW_PUBLIC_DEMO_IN_PRODUCTION === "true" ||
    env.ROUTING_ALLOW_PUBLIC_DEMO === "true";
  if (!productionRuntime || explicitlyAllowed) return;

  if (mode === "osrm-public" || metadata.mode === "public-demo" || !metadata.productionEligible) {
    throw new RoutingProviderConfigurationError(
      "Public OSRM demo routing is not production eligible. Configure ROUTING_PROVIDER=mapbox-managed, osrm-self-hosted, or osrm-managed.",
    );
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function parseOptionalNumber(value: string | undefined) {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new RoutingProviderConfigurationError(
      "MAPBOX_WALKWAY_BIAS must be a number between -1 and 1.",
    );
  }
  return parsed;
}
