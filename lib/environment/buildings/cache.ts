import type {
  BoundingBox,
  Building,
  BuildingProvider,
} from "@/lib/environment/buildings/types";

export type BuildingCacheStats = {
  hits: number;
  misses: number;
  entries: number;
};

type CacheEntry = {
  key: string;
  expiresAt: number;
  value: Promise<Building[]>;
  lastAccessedAt: number;
};

export type CachedBuildingProviderOptions = {
  ttlMs?: number;
  maxEntries?: number;
  precision?: number;
};

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 128;
const DEFAULT_PRECISION = 4;

export class CachedBuildingProvider implements BuildingProvider {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly precision: number;
  private readonly cache = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly provider: BuildingProvider,
    options: CachedBuildingProviderOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.precision = options.precision ?? DEFAULT_PRECISION;
  }

  async getBuildings(bounds: BoundingBox): Promise<Building[]> {
    const key = bboxKey(bounds, this.precision);
    const now = Date.now();
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > now) {
      cached.lastAccessedAt = now;
      this.hits += 1;
      return cached.value;
    }

    this.misses += 1;
    const value = this.provider.getBuildings(bounds);
    this.cache.set(key, {
      key,
      expiresAt: now + this.ttlMs,
      value,
      lastAccessedAt: now,
    });
    this.prune(now);

    try {
      return await value;
    } catch (error) {
      this.cache.delete(key);
      throw error;
    }
  }

  getStats(): BuildingCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.cache.size,
    };
  }

  private prune(now: number) {
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }

    while (this.cache.size > this.maxEntries) {
      const oldest = [...this.cache.values()].sort(
        (left, right) => left.lastAccessedAt - right.lastAccessedAt,
      )[0];
      if (!oldest) return;
      this.cache.delete(oldest.key);
    }
  }
}

function bboxKey(bounds: BoundingBox, precision: number) {
  return [
    bounds.west,
    bounds.south,
    bounds.east,
    bounds.north,
  ]
    .map((value) => value.toFixed(precision))
    .join(",");
}
