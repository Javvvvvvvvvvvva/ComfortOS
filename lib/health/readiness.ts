import { createConfiguredRoutingProvider } from "@/lib/routing/providers/configuredRoutingProvider";
import { createConfiguredGeocodingProvider } from "@/lib/geocoding/providers/configuredGeocodingProvider";

export type ReadinessSubsystem = {
  configured: boolean;
  productionReady: boolean;
  required: boolean;
  mode: string;
};

export type MvpReadiness = {
  status: "ready" | "not-ready";
  checksAreLive: false;
  subsystems: {
    routing: ReadinessSubsystem;
    weather: ReadinessSubsystem;
    buildings: ReadinessSubsystem;
    coveredFeatures: ReadinessSubsystem;
    geocoding: ReadinessSubsystem;
    basemap: ReadinessSubsystem;
    legal: ReadinessSubsystem;
    observability: ReadinessSubsystem;
  };
};

export function evaluateMvpReadiness(
  env: NodeJS.ProcessEnv = process.env,
): MvpReadiness {
  const routing = evaluateRouting(env);
  const weatherUserAgent = env.WEATHER_USER_AGENT?.trim() ?? "";
  const weather = {
    configured: weatherUserAgent.length > 0,
    productionReady:
      weatherUserAgent.length > 0 &&
      !/replace-with|example\.com|stage 1/i.test(weatherUserAgent) &&
      /https?:\/\/|[^\s@]+@[^\s@]+\.[^\s@]+/.test(weatherUserAgent),
    required: true,
    mode: "nws",
  };
  const buildingMode = env.BUILDING_PROVIDER ?? "overpass";
  const buildingServiceUrl = env.BUILDING_QUERY_SERVICE_URL ?? "";
  const buildings = {
    configured:
      (buildingMode === "http-overture" || buildingMode === "building-query-service") &&
      isHttpUrl(buildingServiceUrl),
    productionReady:
      (buildingMode === "http-overture" || buildingMode === "building-query-service") &&
      isProductionUrl(buildingServiceUrl) &&
      Boolean(env.BUILDING_QUERY_SERVICE_TOKEN?.trim()),
    required: true,
    mode: buildingMode,
  };
  const coveredMode = env.COVERED_FEATURE_PROVIDER ?? "disabled";
  const rainCoverRequired = env.REQUIRE_RAIN_COVER === "true";
  const coveredServiceReady =
    coveredMode === "covered-query-service" &&
    isProductionUrl(env.COVERED_FEATURE_QUERY_SERVICE_URL ?? "") &&
    Boolean(env.COVERED_FEATURE_QUERY_SERVICE_TOKEN?.trim());
  const coveredFeatures = {
    configured:
      (coveredMode === "static-osm" && Boolean(env.COVERED_FEATURE_STATIC_GEOJSON)) ||
      coveredServiceReady,
    productionReady: !rainCoverRequired || coveredServiceReady,
    required: rainCoverRequired,
    mode: coveredMode,
  };
  const geocoding = evaluateGeocoding(env);
  const basemapMode = env.NEXT_PUBLIC_BASEMAP_PROVIDER ?? "osm-community";
  const tileUrl = env.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE ??
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const managedMapboxReady =
    basemapMode === "mapbox-managed" && Boolean(env.MAPBOX_ACCESS_TOKEN?.trim());
  const customBasemapReady =
    basemapMode === "custom" &&
    isProductionUrl(tileUrl) &&
    !/tile\.openstreetmap\.org/i.test(tileUrl);
  const basemap = {
    configured: managedMapboxReady || isHttpUrl(tileUrl),
    productionReady: managedMapboxReady || customBasemapReady,
    required: true,
    mode: managedMapboxReady
      ? "mapbox-managed"
      : /tile\.openstreetmap\.org/i.test(tileUrl)
        ? "public-community"
        : basemapMode,
  };
  const supportUrl = env.NEXT_PUBLIC_SUPPORT_URL?.trim() ?? "";
  const legalReviewApproved = env.LEGAL_REVIEW_APPROVED === "true";
  const legal = {
    configured: Boolean(supportUrl) && env.LEGAL_REVIEW_APPROVED !== undefined,
    productionReady: isProductionUrl(supportUrl) && legalReviewApproved,
    required: true,
    mode: legalReviewApproved ? "review-approved" : "review-pending",
  };
  const observabilityProvider = env.OBSERVABILITY_PROVIDER?.trim() ?? "console";
  const alertsConfigured = env.OBSERVABILITY_ALERTS_CONFIGURED === "true";
  const observability = {
    configured: observabilityProvider !== "console",
    productionReady: observabilityProvider !== "console" && alertsConfigured,
    required: true,
    mode: observabilityProvider,
  };

  const subsystems = {
    routing,
    weather,
    buildings,
    coveredFeatures,
    geocoding,
    basemap,
    legal,
    observability,
  };
  const ready = Object.values(subsystems).every((subsystem) => subsystem.productionReady);

  return {
    status: ready ? "ready" : "not-ready",
    checksAreLive: false,
    subsystems,
  };
}

function evaluateGeocoding(env: NodeJS.ProcessEnv): ReadinessSubsystem {
  try {
    const configured = createConfiguredGeocodingProvider(env);
    return {
      configured: true,
      productionReady:
        configured.metadata.productionEligible &&
        configured.metadata.mode !== "public-demo",
      required: true,
      mode: configured.mode,
    };
  } catch {
    return {
      configured: false,
      productionReady: false,
      required: true,
      mode: env.GEOCODING_PROVIDER ?? "unconfigured",
    };
  }
}

function evaluateRouting(env: NodeJS.ProcessEnv): ReadinessSubsystem {
  try {
    const configured = createConfiguredRoutingProvider(env);
    return {
      configured: true,
      productionReady:
        configured.metadata.productionEligible &&
        configured.metadata.mode !== "public-demo",
      required: true,
      mode: configured.mode,
    };
  } catch {
    return {
      configured: false,
      productionReady: false,
      required: true,
      mode: env.ROUTING_PROVIDER ?? "unconfigured",
    };
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isProductionUrl(value: string) {
  if (!isHttpUrl(value)) return false;
  const hostname = new URL(value).hostname;
  return hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1";
}
