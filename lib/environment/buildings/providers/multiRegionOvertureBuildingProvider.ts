import type {
  BoundingBox,
  Building,
  BuildingProvider,
  BuildingProviderMetadata,
} from "@/lib/environment/buildings/types";
import {
  LocalOvertureBuildingProvider,
  type LocalOvertureStoreManifest,
} from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";

export class MultiRegionOvertureBuildingProvider implements BuildingProvider {
  private readonly providers: LocalOvertureBuildingProvider[];

  constructor(storeDirs: string[]) {
    const normalized = storeDirs.map((storeDir) => storeDir.trim()).filter(Boolean);
    if (!normalized.length) {
      throw new Error("At least one Overture building store directory is required.");
    }
    this.providers = normalized.map(
      (storeDir) => new LocalOvertureBuildingProvider({ storeDir }),
    );
  }

  async getBuildings(bounds: BoundingBox): Promise<Building[]> {
    const selected = await this.providersForBounds(bounds);
    if (!selected.length) {
      throw new UnsupportedBuildingRegionError();
    }
    const groups = await Promise.all(
      selected.map((provider) => provider.getBuildings(bounds)),
    );
    return dedupeBuildings(groups.flat());
  }

  async getMetadata(): Promise<BuildingProviderMetadata> {
    const manifests = await Promise.all(
      this.providers.map((provider) => provider.getManifest()),
    );
    return metadataFromManifests(manifests);
  }

  async getMetadataForBounds(bounds: BoundingBox): Promise<BuildingProviderMetadata> {
    const selected = await this.providersForBounds(bounds);
    if (!selected.length) {
      return {
        ...(await this.getMetadata()),
        region: "unsupported",
      };
    }
    const manifests = await Promise.all(selected.map((provider) => provider.getManifest()));
    return metadataFromManifests(manifests);
  }

  private async providersForBounds(bounds: BoundingBox) {
    const pairs = await Promise.all(
      this.providers.map(async (provider) => ({
        provider,
        manifest: await provider.getManifest(),
      })),
    );
    return pairs
      .filter(({ manifest }) => manifestIntersectsBounds(manifest, bounds))
      .map(({ provider }) => provider);
  }
}

export class UnsupportedBuildingRegionError extends Error {
  constructor() {
    super("No configured Overture building region covers this request.");
    this.name = "UnsupportedBuildingRegionError";
  }
}

function metadataFromManifests(
  manifests: LocalOvertureStoreManifest[],
): BuildingProviderMetadata {
  const releases = unique(manifests.flatMap((manifest) => manifest.release ? [manifest.release] : []));
  const regions = unique(manifests.map((manifest) => manifest.region));
  return {
    provider: "Overture Maps",
    datasetVersion: releases.join(",") || undefined,
    generatedAt: manifests
      .map((manifest) => manifest.createdAt)
      .sort()
      .at(-1),
    region: regions.join(","),
    source: "overture-buildings",
  };
}

export function manifestIntersectsBounds(
  manifest: LocalOvertureStoreManifest,
  bounds: BoundingBox,
) {
  if (!manifest.bbox) return true;
  const [west, south, east, north] = manifest.bbox;
  return !(
    east < bounds.west ||
    west > bounds.east ||
    north < bounds.south ||
    south > bounds.north
  );
}

function dedupeBuildings(buildings: Building[]) {
  const seen = new Set<string>();
  return buildings.filter((building) => {
    if (seen.has(building.id)) return false;
    seen.add(building.id);
    return true;
  });
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
