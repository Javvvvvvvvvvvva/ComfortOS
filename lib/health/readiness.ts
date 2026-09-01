import { createConfiguredRoutingProvider } from "@/lib/routing/providers/configuredRoutingProvider";
import { createConfiguredGeocodingProvider } from "@/lib/geocoding/providers/configuredGeocodingProvider";

export type ReadinessSubsystem = {
  configured: boolean;
  productionReady: boolean;
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
      !/replace-with|example\.com|stage 1/i.test(weatherUserAgent),
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
      isProductionUrl(buildingServiceUrl),
    mode: buildingMode,
  };
  const coveredMode = env.COVERED_FEATURE_PROVIDER ?? "disabled";
  const coveredFeatures = {
    configured:
      coveredMode === "static-osm" && Boolean(env.COVERED_FEATURE_STATIC_GEOJSON),
    productionReady: false,
    mode: coveredMode,
  };
  const geocoding = evaluateGeocoding(env);
  const tileUrl = env.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE ??
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const basemap = {
    configured: isHttpUrl(tileUrl),
    productionReady:
      isProductionUrl(tileUrl) && !/tile\.openstreetmap\.org/i.test(tileUrl),
    mode: /tile\.openstreetmap\.org/i.test(tileUrl) ? "public-community" : "configured",
  };

  const subsystems = {
    routing,
    weather,
    buildings,
    coveredFeatures,
    geocoding,
    basemap,
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
      mode: configured.mode,
    };
  } catch {
    return {
      configured: false,
      productionReady: false,
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
      mode: configured.mode,
    };
  } catch {
    return {
      configured: false,
      productionReady: false,
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
