import { CachedBuildingProvider } from "@/lib/environment/buildings/cache";
import type { BuildingProvider } from "@/lib/environment/buildings/types";
import { FallbackBuildingProvider } from "@/lib/environment/buildings/providers/fallbackBuildingProvider";
import { LocalOvertureBuildingProvider } from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";
import { OverpassBuildingProvider } from "@/lib/environment/buildings/providers/overpassBuildingProvider";

export type BuildingProviderMode = "local-overture" | "overpass" | "local-overture-with-overpass-fallback";

export type ConfiguredBuildingProvider = {
  provider: BuildingProvider;
  mode: BuildingProviderMode;
};

export function createConfiguredBuildingProvider(): ConfiguredBuildingProvider {
  const localStoreDir = process.env.BUILDING_LOCAL_OVERTURE_STORE_DIR;
  const requestedMode = process.env.BUILDING_PROVIDER;
  const overpass = new OverpassBuildingProvider({
    baseUrl: process.env.BUILDING_OVERPASS_BASE_URL,
  });

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
