import type {
  BoundingBox,
  Building,
  BuildingProviderMetadata,
  BuildingProvider,
} from "@/lib/environment/buildings/types";

type HttpBuildingProviderOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

type BuildingQueryResponse = {
  buildings?: unknown;
  metadata?: BuildingProviderMetadata;
};

export class HttpBuildingProvider implements BuildingProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private lastMetadata: BuildingProviderMetadata | null = null;

  constructor(options: HttpBuildingProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
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

    const response = await this.fetchImpl(url, { signal: options?.signal });
    if (!response.ok) {
      throw new Error(`Building query service unavailable (${response.status}).`);
    }

    const payload = (await response.json()) as BuildingQueryResponse;
    if (!Array.isArray(payload.buildings)) {
      throw new Error("Building query service returned an invalid payload.");
    }
    this.lastMetadata = payload.metadata ?? null;

    return payload.buildings.map(normalizeServiceBuilding);
  }

  async getMetadata(): Promise<BuildingProviderMetadata | null> {
    if (this.lastMetadata) return this.lastMetadata;

    const response = await this.fetchImpl(`${this.baseUrl}/metadata`);
    if (!response.ok) return null;
    const payload = (await response.json()) as { metadata?: BuildingProviderMetadata };
    this.lastMetadata = payload.metadata ?? null;
    return this.lastMetadata;
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
