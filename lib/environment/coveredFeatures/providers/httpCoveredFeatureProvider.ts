import type { BoundingBox } from "@/lib/environment/buildings/types";
import type {
  CoveredFeature,
  CoveredFeatureProvider,
  CoveredFeatureProviderMetadata,
  CoveredFeatureProviderResult,
} from "@/lib/environment/coveredFeatures/types";

type HttpCoveredFeatureProviderOptions = {
  baseUrl: string;
  authToken?: string;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  maxFeatures?: number;
  fetchImpl?: typeof fetch;
};

type CoveredFeatureQueryResponse = {
  features?: unknown;
  metadata?: CoveredFeatureProviderMetadata;
};

export class HttpCoveredFeatureProvider implements CoveredFeatureProvider {
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly requestTimeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly maxFeatures: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpCoveredFeatureProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.authToken = options.authToken?.trim() || undefined;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.maxResponseBytes = options.maxResponseBytes ?? 2 * 1024 * 1024;
    this.maxFeatures = options.maxFeatures ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getCoveredFeatures(
    bounds: BoundingBox,
    options?: { signal?: AbortSignal },
  ): Promise<CoveredFeatureProviderResult> {
    const url = new URL(`${this.baseUrl}/covered-features`);
    url.searchParams.set(
      "bbox",
      [bounds.west, bounds.south, bounds.east, bounds.north].join(","),
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const abortFromCaller = () => controller.abort();
    options?.signal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const response = await this.fetchImpl(url, {
        headers: {
          accept: "application/json",
          ...(this.authToken ? { authorization: `Bearer ${this.authToken}` } : {}),
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Covered-feature query service unavailable (${response.status}).`);
      }
      const payload = await readBoundedJson(response, this.maxResponseBytes);
      if (!Array.isArray(payload.features) || !payload.metadata) {
        throw new Error("Covered-feature query service returned an invalid payload.");
      }
      if (payload.features.length > this.maxFeatures) {
        throw new Error("Covered-feature query service returned too many features.");
      }

      return {
        features: payload.features.map(normalizeCoveredFeature),
        metadata: payload.metadata,
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Covered-feature")) throw error;
      throw new Error("Covered-feature query service unavailable.");
    } finally {
      clearTimeout(timeout);
      options?.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

async function readBoundedJson(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Covered-feature query service response exceeded the size limit.");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error("Covered-feature query service response exceeded the size limit.");
  }
  try {
    return JSON.parse(text) as CoveredFeatureQueryResponse;
  } catch {
    throw new Error("Covered-feature query service returned invalid JSON.");
  }
}

function normalizeCoveredFeature(value: unknown): CoveredFeature {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Covered-feature query service returned an invalid feature.");
  }
  const feature = value as Partial<CoveredFeature>;
  if (
    typeof feature.id !== "string" ||
    !feature.geometry ||
    (feature.geometry.type !== "LineString" && feature.geometry.type !== "Polygon") ||
    typeof feature.kind !== "string" ||
    typeof feature.source !== "string" ||
    typeof feature.confidence !== "number" ||
    typeof feature.access !== "string" ||
    typeof feature.accessConfidence !== "number" ||
    !feature.evidence
  ) {
    throw new Error("Covered-feature query service returned an invalid feature.");
  }
  return feature as CoveredFeature;
}
