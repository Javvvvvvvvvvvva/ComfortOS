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

const MANIFEST_READ_CONCURRENCY = 32;
const INLINE_REGION_METADATA_LIMIT = 12;

export class MultiRegionOvertureBuildingProvider implements BuildingProvider {
  private readonly providers: LocalOvertureBuildingProvider[];
  private readonly maxLoadedStores: number;
  private manifestIndexPromise: Promise<ProviderManifest[]> | null = null;
  private readonly lastUsed = new Map<LocalOvertureBuildingProvider, number>();
  private accessSequence = 0;

  constructor(
    input:
      | string[]
      | {
          storeDirs: string[];
          maxLoadedStores?: number;
        },
  ) {
    const storeDirs = Array.isArray(input) ? input : input.storeDirs;
    const normalized = storeDirs.map((storeDir) => storeDir.trim()).filter(Boolean);
    if (!normalized.length) {
      throw new Error("At least one Overture building store directory is required.");
    }
    this.providers = normalized.map(
      (storeDir) => new LocalOvertureBuildingProvider({ storeDir }),
    );
    const configuredMaximum = Array.isArray(input) ? undefined : input.maxLoadedStores;
    this.maxLoadedStores =
      typeof configuredMaximum === "number" &&
      Number.isInteger(configuredMaximum) &&
      configuredMaximum > 0
        ? configuredMaximum
        : 8;
  }

  async getBuildings(bounds: BoundingBox): Promise<Building[]> {
    const selected = await this.providersForBounds(bounds);
    if (!selected.length) {
      throw new UnsupportedBuildingRegionError();
    }
    selected.forEach((provider) => {
      this.lastUsed.set(provider, ++this.accessSequence);
    });
    try {
      const groups = await Promise.all(
        selected.map((provider) => provider.getBuildings(bounds)),
      );
      return dedupeBuildings(groups.flat());
    } finally {
      this.pruneLoadedStores(new Set(selected));
    }
  }

  async getMetadata(): Promise<BuildingProviderMetadata> {
    return metadataFromManifests(
      (await this.getManifestIndex()).map(({ manifest }) => manifest),
    );
  }

  async getMetadataForBounds(bounds: BoundingBox): Promise<BuildingProviderMetadata> {
    const selected = await this.providersForBounds(bounds);
    if (!selected.length) {
      return {
        ...(await this.getMetadata()),
        region: "unsupported",
      };
    }
    const selectedSet = new Set(selected);
    const manifests = (await this.getManifestIndex())
      .filter(({ provider }) => selectedSet.has(provider))
      .map(({ manifest }) => manifest);
    return metadataFromManifests(manifests);
  }

  getLoadedStoreCount() {
    return this.providers.filter((provider) => provider.isLoaded()).length;
  }

  private async providersForBounds(bounds: BoundingBox) {
    return (await this.getManifestIndex())
      .filter(({ manifest }) => manifestIntersectsBounds(manifest, bounds))
      .map(({ provider }) => provider);
  }

  private getManifestIndex() {
    if (!this.manifestIndexPromise) {
      this.manifestIndexPromise = this.loadManifestIndex().catch((error) => {
        this.manifestIndexPromise = null;
        throw error;
      });
    }
    return this.manifestIndexPromise;
  }

  private async loadManifestIndex() {
    const index: ProviderManifest[] = [];
    for (
      let offset = 0;
      offset < this.providers.length;
      offset += MANIFEST_READ_CONCURRENCY
    ) {
      const batch = this.providers.slice(offset, offset + MANIFEST_READ_CONCURRENCY);
      index.push(
        ...(await Promise.all(
          batch.map(async (provider) => ({
            provider,
            manifest: await provider.getManifest(),
          })),
        )),
      );
    }
    return index;
  }

  private pruneLoadedStores(active: Set<LocalOvertureBuildingProvider>) {
    const loaded = this.providers.filter((provider) => provider.isLoaded());
    const targetCount = Math.max(this.maxLoadedStores, active.size);
    if (loaded.length <= targetCount) return;

    const releasable = loaded
      .filter((provider) => !active.has(provider))
      .sort(
        (left, right) =>
          (this.lastUsed.get(left) ?? 0) - (this.lastUsed.get(right) ?? 0),
      );
    let loadedCount = loaded.length;
    for (const provider of releasable) {
      if (loadedCount <= targetCount) break;
      provider.releaseStore();
      loadedCount -= 1;
    }
  }
}

type ProviderManifest = {
  provider: LocalOvertureBuildingProvider;
  manifest: LocalOvertureStoreManifest;
};

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
    region:
      regions.length <= INLINE_REGION_METADATA_LIMIT
        ? regions.join(",")
        : `${regions.length} spatial partitions`,
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
