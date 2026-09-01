import { CachedBuildingProvider } from "@/lib/environment/buildings/cache";
import type { BuildingProvider } from "@/lib/environment/buildings/types";
import { FallbackBuildingProvider } from "@/lib/environment/buildings/providers/fallbackBuildingProvider";
import { HttpBuildingProvider } from "@/lib/environment/buildings/providers/httpBuildingProvider";
import { LocalOvertureBuildingProvider } from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";
import { OverpassBuildingProvider } from "@/lib/environment/buildings/providers/overpassBuildingProvider";

export type BuildingProviderMode =
  | "building-query-service"
  | "http-overture"
  | "local-overture"
  | "overpass"
  | "local-overture-with-overpass-fallback";

export type ConfiguredBuildingProvider = {
  provider: BuildingProvider;
  mode: BuildingProviderMode;
};

export function createConfiguredBuildingProvider(): ConfiguredBuildingProvider {
  const localStoreDir = process.env.BUILDING_LOCAL_OVERTURE_STORE_DIR;
  const requestedMode = process.env.BUILDING_PROVIDER;
  assertNoFixtureBuildingProviderInProduction({
    mode: requestedMode,
    localStoreDir,
  });

  if (requestedMode === "building-query-service" || requestedMode === "http-overture") {
    const serviceUrl = process.env.BUILDING_QUERY_SERVICE_URL;
    if (!serviceUrl) {
      throw new Error(
        "BUILDING_QUERY_SERVICE_URL is required when BUILDING_PROVIDER uses the HTTP Overture query service.",
      );
    }

    return {
      provider: new CachedBuildingProvider(new HttpBuildingProvider({ baseUrl: serviceUrl })),
      mode: requestedMode === "http-overture" ? "http-overture" : "building-query-service",
    };
  }

  const overpass = new OverpassBuildingProvider({
    baseUrl: process.env.BUILDING_OVERPASS_BASE_URL,
  });

  if (
    (requestedMode === "local-overture" ||
      requestedMode === "local-overture-with-overpass-fallback") &&
    !localStoreDir
  ) {
    throw new Error(
      "BUILDING_LOCAL_OVERTURE_STORE_DIR is required when BUILDING_PROVIDER uses local Overture data.",
    );
  }

  if (localStoreDir && requestedMode !== "overpass") {
    const local = new LocalOvertureBuildingProvider({ storeDir: localStoreDir });
    const provider =
      requestedMode === "local-overture"
        ? local
        : new FallbackBuildingProvider(local, overpass);

    return {
      provider: new CachedBuildingProvider(provider),
      mode:
        requestedMode === "local-overture"
          ? "local-overture"
          : "local-overture-with-overpass-fallback",
    };
  }

  return {
    provider: new CachedBuildingProvider(overpass),
    mode: "overpass",
  };
}

export function assertNoFixtureBuildingProviderInProduction({
  mode,
  localStoreDir,
  nodeEnv = process.env.NODE_ENV,
}: {
  mode?: string;
  localStoreDir?: string;
  nodeEnv?: string;
}) {
  if (nodeEnv !== "production") return;

  if (mode?.includes("fixture")) {
    throw new Error("Fixture building providers are prohibited in production.");
  }

  if (localStoreDir && isFixtureStorePath(localStoreDir)) {
    throw new Error("Fixture building stores are prohibited in production.");
  }
}

function isFixtureStorePath(value: string) {
  return /(^|\/)(fixtures|test-fixtures|tests)(\/|$)/.test(value);
}
