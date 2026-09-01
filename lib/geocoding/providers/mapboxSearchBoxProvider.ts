import type { Coordinate } from "@/lib/geo/types";
import { assertValidCoordinate } from "@/lib/geo/validation";
import {
  GeocodingProviderConfigurationError,
  GeocodingProviderUnavailableError,
} from "@/lib/geocoding/errors";
import type {
  GeocodingProvider,
  GeocodingRequestOptions,
  PlaceResult,
  PlaceSuggestion,
} from "@/lib/geocoding/types";

type MapboxSearchProperties = {
  mapbox_id?: unknown;
  name?: unknown;
  name_preferred?: unknown;
  feature_type?: unknown;
  address?: unknown;
  full_address?: unknown;
  place_formatted?: unknown;
  poi_category?: unknown;
  operational_status?: unknown;
};

type MapboxSuggestionResponse = {
  suggestions?: unknown;
};

type MapboxFeature = {
  type?: unknown;
  geometry?: {
    type?: unknown;
    coordinates?: unknown;
  };
  properties?: MapboxSearchProperties;
};

type MapboxFeatureCollection = {
  features?: unknown;
};

export type MapboxSearchBoxProviderOptions = {
  accessToken: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  countryCode?: string;
  language?: string;
  resultLimit?: number;
  requestTimeoutMs?: number;
};

const DEFAULT_MAPBOX_SEARCH_BASE_URL = "https://api.mapbox.com/search/searchbox/v1";

export class MapboxSearchBoxProvider implements GeocodingProvider {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly countryCode: string;
  private readonly language: string;
  private readonly resultLimit: number;
  private readonly requestTimeoutMs: number;

  constructor(options: MapboxSearchBoxProviderOptions) {
    if (!isValidMapboxAccessToken(options.accessToken)) {
      throw new GeocodingProviderConfigurationError(
        "A valid Mapbox access token is required for managed geocoding.",
      );
    }

    this.accessToken = options.accessToken.trim();
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_MAPBOX_SEARCH_BASE_URL);
    this.fetcher = options.fetcher ?? fetch;
    this.countryCode = options.countryCode ?? "US";
    this.language = options.language ?? "en";
    this.resultLimit = options.resultLimit ?? 6;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 8_000;
  }

  async search(
    query: string,
    proximity?: Coordinate,
    options?: GeocodingRequestOptions,
  ): Promise<PlaceSuggestion[]> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 3) return [];
    if (!options?.sessionToken?.trim()) {
      throw new GeocodingProviderConfigurationError(
        "Managed autocomplete requires a search session token.",
      );
    }
    if (proximity) assertValidCoordinate(proximity, "Search proximity");

    const url = this.createUrl("suggest");
    url.searchParams.set("q", normalizedQuery);
    url.searchParams.set("session_token", options.sessionToken.trim());
    this.addCommonParameters(url, proximity);

    const payload = await this.fetchJson(url, options.signal);
    return normalizeMapboxSuggestions(payload as MapboxSuggestionResponse);
  }

  async retrieve(
    suggestionId: string,
    options?: GeocodingRequestOptions,
  ): Promise<PlaceResult> {
    const mapboxId = parseSuggestionId(suggestionId);
    if (!options?.sessionToken?.trim()) {
      throw new GeocodingProviderConfigurationError(
        "Managed place retrieval requires the matching search session token.",
      );
    }

    const url = this.createUrl(`retrieve/${encodeURIComponent(mapboxId)}`);
    url.searchParams.set("session_token", options.sessionToken.trim());
    url.searchParams.set("language", this.language);

    const payload = await this.fetchJson(url, options.signal);
    const places = normalizeMapboxFeatureCollection(payload as MapboxFeatureCollection);
    if (!places[0]) {
      throw new GeocodingProviderUnavailableError(
        "The selected place is no longer available.",
      );
    }
    return places[0];
  }

  async reverseGeocode(
    coordinate: Coordinate,
    options?: GeocodingRequestOptions,
  ): Promise<PlaceResult | null> {
    assertValidCoordinate(coordinate, "Reverse geocode coordinate");

    const url = this.createUrl("reverse");
    url.searchParams.set("latitude", String(coordinate.latitude));
    url.searchParams.set("longitude", String(coordinate.longitude));
    url.searchParams.set("limit", "1");
    url.searchParams.set("country", this.countryCode);
    url.searchParams.set("language", this.language);

    const payload = await this.fetchJson(url, options?.signal);
    return normalizeMapboxFeatureCollection(payload as MapboxFeatureCollection)[0] ?? null;
  }

  private createUrl(path: string) {
    const url = new URL(`${this.baseUrl}/${path}`);
    url.searchParams.set("access_token", this.accessToken);
    return url;
  }

  private addCommonParameters(url: URL, proximity?: Coordinate) {
    url.searchParams.set("limit", String(this.resultLimit));
    url.searchParams.set("country", this.countryCode);
    url.searchParams.set("language", this.language);
    if (proximity) {
      url.searchParams.set(
        "proximity",
        `${proximity.longitude},${proximity.latitude}`,
      );
    }
  }

  private async fetchJson(url: URL, signal?: AbortSignal): Promise<unknown> {
    const request = createRequestSignal(signal, this.requestTimeoutMs);
    try {
      const response = await this.fetcher(url, {
        headers: { accept: "application/json" },
        signal: request.signal,
      });
      if (!response.ok) {
        throw new GeocodingProviderUnavailableError(
          `Managed geocoding request failed with status ${response.status}.`,
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof GeocodingProviderUnavailableError) throw error;
      if (isAbortError(error) && signal?.aborted) throw error;
      throw new GeocodingProviderUnavailableError("Managed geocoding is unavailable.");
    } finally {
      request.dispose();
    }
  }
}

export function normalizeMapboxSuggestions(
  payload: MapboxSuggestionResponse,
): PlaceSuggestion[] {
  if (!Array.isArray(payload.suggestions)) {
    throw new GeocodingProviderUnavailableError(
      "Managed geocoding returned malformed suggestions.",
    );
  }

  return payload.suggestions
    .map((suggestion) => normalizeSuggestion(suggestion as MapboxSearchProperties))
    .filter((suggestion): suggestion is PlaceSuggestion => Boolean(suggestion));
}

export function normalizeMapboxFeatureCollection(
  payload: MapboxFeatureCollection,
): PlaceResult[] {
  if (!Array.isArray(payload.features)) {
    throw new GeocodingProviderUnavailableError(
      "Managed geocoding returned malformed results.",
    );
  }

  return payload.features
    .map((feature) => normalizeFeature(feature as MapboxFeature))
    .filter((place): place is PlaceResult => Boolean(place));
}

function normalizeSuggestion(
  properties: MapboxSearchProperties,
): PlaceSuggestion | null {
  if (getString(properties.operational_status)?.toLowerCase() === "closed") {
    return null;
  }
  const mapboxId = getString(properties.mapbox_id);
  const name = getString(properties.name_preferred) ?? getString(properties.name);
  if (!mapboxId || !name) return null;

  return {
    id: `mapbox:${mapboxId}`,
    name,
    address: buildAddress(properties),
    category: buildCategory(properties),
  };
}

function normalizeFeature(feature: MapboxFeature): PlaceResult | null {
  const coordinates = feature.geometry?.coordinates;
  if (
    feature.type !== "Feature" ||
    feature.geometry?.type !== "Point" ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  ) {
    return null;
  }

  const properties = feature.properties ?? {};
  if (getString(properties.operational_status)?.toLowerCase() === "closed") {
    return null;
  }
  const mapboxId = getString(properties.mapbox_id);
  const name = getString(properties.name_preferred) ?? getString(properties.name);
  if (!mapboxId || !name) return null;

  return {
    id: `mapbox:${mapboxId}`,
    name,
    address: buildAddress(properties),
    coordinate: {
      longitude: coordinates[0] as number,
      latitude: coordinates[1] as number,
    },
    category: buildCategory(properties),
  };
}

function buildAddress(properties: MapboxSearchProperties) {
  const fullAddress = getString(properties.full_address);
  if (fullAddress) return fullAddress;

  const parts = [
    getString(properties.address),
    getString(properties.place_formatted),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function buildCategory(properties: MapboxSearchProperties) {
  const categories = Array.isArray(properties.poi_category)
    ? properties.poi_category.map(getString).filter(Boolean)
    : [];
  return categories[0] ?? getString(properties.feature_type);
}

function parseSuggestionId(suggestionId: string) {
  if (!suggestionId.startsWith("mapbox:") || suggestionId.length <= "mapbox:".length) {
    throw new GeocodingProviderConfigurationError(
      "The selected place does not belong to the configured provider.",
    );
  }
  return suggestionId.slice("mapbox:".length);
}

function normalizeBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GeocodingProviderConfigurationError(
      "MAPBOX_SEARCH_BASE_URL must be a valid HTTP URL.",
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new GeocodingProviderConfigurationError(
      "MAPBOX_SEARCH_BASE_URL must be a valid HTTP URL.",
    );
  }
  return value.replace(/\/$/, "");
}

function isValidMapboxAccessToken(value: string) {
  const token = value.trim();
  return (token.startsWith("pk.") || token.startsWith("sk.")) && token.length > 10;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function createRequestSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    },
  };
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
