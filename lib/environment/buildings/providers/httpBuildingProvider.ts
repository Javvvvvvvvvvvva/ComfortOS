import type {
  BoundingBox,
  Building,
  BuildingProviderMetadata,
  BuildingProvider,
} from "@/lib/environment/buildings/types";

type HttpBuildingProviderOptions = {
  baseUrl: string;
  authToken?: string;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  maxBuildings?: number;
  fetchImpl?: typeof fetch;
};

type BuildingQueryResponse = {
  buildings?: unknown;
  metadata?: BuildingProviderMetadata;
};

export class HttpBuildingProvider implements BuildingProvider {
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly requestTimeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly maxBuildings: number;
  private readonly fetchImpl: typeof fetch;
  private lastMetadata: BuildingProviderMetadata | null = null;
  private readonly metadataByBounds = new Map<string, BuildingProviderMetadata | null>();

  constructor(options: HttpBuildingProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.authToken = options.authToken?.trim() || undefined;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 6_000;
    this.maxResponseBytes = options.maxResponseBytes ?? 8 * 1024 * 1024;
    this.maxBuildings = options.maxBuildings ?? 25_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getBuildings(
    bounds: BoundingBox,
    options?: { signal?: AbortSignal },
  ): Promise<Building[]> {
    const url = new URL(`${this.baseUrl}/buildings`);
    url.searchParams.set(
      "bbox",
      [bounds.west, bounds.south, bounds.east, bounds.north].join(","),
    );

    const response = await this.request(url, options?.signal);
    if (!response.ok) {
      throw new Error(`Building query service unavailable (${response.status}).`);
    }

    const payload = await readBoundedJson<BuildingQueryResponse>(
      response,
      this.maxResponseBytes,
    );
    if (!Array.isArray(payload.buildings)) {
      throw new Error("Building query service returned an invalid payload.");
    }
    if (payload.buildings.length > this.maxBuildings) {
      throw new Error("Building query service returned too many buildings.");
    }
    this.lastMetadata = payload.metadata ?? null;
    this.rememberBoundsMetadata(bounds, this.lastMetadata);

    return payload.buildings.map(normalizeServiceBuilding);
  }

  async getMetadata(): Promise<BuildingProviderMetadata | null> {
    if (this.lastMetadata) return this.lastMetadata;

    const response = await this.request(`${this.baseUrl}/metadata`);
    if (!response.ok) return null;
    const payload = await readBoundedJson<{ metadata?: BuildingProviderMetadata }>(
      response,
      Math.min(this.maxResponseBytes, 256 * 1024),
    );
    this.lastMetadata = payload.metadata ?? null;
    return this.lastMetadata;
  }

  async getMetadataForBounds(
    bounds: BoundingBox,
  ): Promise<BuildingProviderMetadata | null> {
    return this.metadataByBounds.get(bboxKey(bounds)) ?? null;
  }

  private rememberBoundsMetadata(
    bounds: BoundingBox,
    metadata: BuildingProviderMetadata | null,
  ) {
    const key = bboxKey(bounds);
    this.metadataByBounds.delete(key);
    this.metadataByBounds.set(key, metadata);
    while (this.metadataByBounds.size > 128) {
      const oldestKey = this.metadataByBounds.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.metadataByBounds.delete(oldestKey);
    }
  }

  private async request(input: URL | string, signal?: AbortSignal) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      return await this.fetchImpl(input, {
        headers: {
          accept: "application/json",
          ...(this.authToken ? { authorization: `Bearer ${this.authToken}` } : {}),
        },
        signal: controller.signal,
      });
    } catch {
      throw new Error("Building query service unavailable.");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

function bboxKey(bounds: BoundingBox) {
  return [bounds.west, bounds.south, bounds.east, bounds.north].join(",");
}

async function readBoundedJson<T>(response: Response, maxBytes: number): Promise<T> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Building query service response exceeded the size limit.");
  }

  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error("Building query service response exceeded the size limit.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Building query service returned invalid JSON.");
  }
}

function normalizeServiceBuilding(value: unknown): Building {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Building query service returned an invalid building.");
  }

  const building = value as Partial<Building>;
  if (
    typeof building.id !== "string" ||
    !building.footprint ||
    typeof building.source !== "string" ||
    typeof building.confidence !== "number" ||
    !building.heightSource
  ) {
    throw new Error("Building query service returned an invalid building.");
  }

  return {
    id: building.id,
    footprint: building.footprint,
    heightMeters: building.heightMeters ?? null,
    minHeightMeters: building.minHeightMeters ?? null,
    floors: building.floors ?? null,
    source: building.source,
    confidence: building.confidence,
    heightSource: building.heightSource,
  };
}
