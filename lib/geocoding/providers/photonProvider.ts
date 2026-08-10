import type { Coordinate } from "@/lib/geo/types";
import { assertValidCoordinate } from "@/lib/geo/validation";
import type { GeocodingProvider, PlaceResult } from "@/lib/geocoding/types";

type PhotonFeature = {
  type?: unknown;
  geometry?: {
    type?: unknown;
    coordinates?: unknown;
  };
  properties?: {
    name?: unknown;
    street?: unknown;
    housenumber?: unknown;
    postcode?: unknown;
    city?: unknown;
    district?: unknown;
    county?: unknown;
    state?: unknown;
    country?: unknown;
    countrycode?: unknown;
    osm_key?: unknown;
    osm_value?: unknown;
    osm_type?: unknown;
    osm_id?: unknown;
    type?: unknown;
  };
};

type PhotonFeatureCollection = {
  features?: unknown;
};

export type PhotonGeocodingProviderOptions = {
  baseUrl: string;
  fetcher?: typeof fetch;
  countryCode?: string;
  resultLimit?: number;
};

export class PhotonGeocodingProvider implements GeocodingProvider {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly countryCode: string;
  private readonly resultLimit: number;

  constructor(options: PhotonGeocodingProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
    this.countryCode = options.countryCode ?? "US";
    this.resultLimit = options.resultLimit ?? 6;
  }

  async search(query: string, proximity?: Coordinate): Promise<PlaceResult[]> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 3) return [];

    if (proximity) {
      assertValidCoordinate(proximity, "Search proximity");
    }

    const url = new URL(`${this.baseUrl}/api`);
    url.searchParams.set("q", normalizedQuery);
    url.searchParams.set("limit", String(this.resultLimit));
    url.searchParams.set("lang", "en");
    url.searchParams.set("countrycode", this.countryCode);

    if (proximity) {
      url.searchParams.set("lat", String(proximity.latitude));
      url.searchParams.set("lon", String(proximity.longitude));
    }

    return this.fetchPlaces(url);
  }

  async reverseGeocode(coordinate: Coordinate): Promise<PlaceResult | null> {
    assertValidCoordinate(coordinate, "Reverse geocode coordinate");

    const url = new URL(`${this.baseUrl}/reverse`);
    url.searchParams.set("lat", String(coordinate.latitude));
    url.searchParams.set("lon", String(coordinate.longitude));
    url.searchParams.set("limit", "1");
    url.searchParams.set("lang", "en");
    url.searchParams.set("countrycode", this.countryCode);

    const places = await this.fetchPlaces(url);
    return places[0] ?? null;
  }

  private async fetchPlaces(url: URL): Promise<PlaceResult[]> {
    const response = await this.fetcher(url, {
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Geocoding request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as PhotonFeatureCollection;
    return normalizePhotonFeatureCollection(payload);
  }
}

export function normalizePhotonFeatureCollection(
  payload: PhotonFeatureCollection,
): PlaceResult[] {
  if (!Array.isArray(payload.features)) {
    throw new Error("Geocoding provider returned malformed results.");
  }

  return payload.features
    .map((feature) => normalizePhotonFeature(feature as PhotonFeature))
    .filter((place): place is PlaceResult => Boolean(place));
}

function normalizePhotonFeature(feature: PhotonFeature): PlaceResult | null {
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
  const name = getString(properties.name) ?? buildFallbackName(properties);
  if (!name) return null;

  const coordinate = {
    latitude: coordinates[1] as number,
    longitude: coordinates[0] as number,
  };

  const address = buildAddress(properties, name);
  const category = buildCategory(properties);

  return {
    id: buildId(properties, coordinate, name),
    name,
    address,
    coordinate,
    category,
  };
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function buildFallbackName(properties: NonNullable<PhotonFeature["properties"]>) {
  const street = getString(properties.street);
  const city = getString(properties.city);
  const district = getString(properties.district);
  return street ?? city ?? district;
}

function buildAddress(
  properties: NonNullable<PhotonFeature["properties"]>,
  name: string,
) {
  const streetParts = [
    getString(properties.housenumber),
    getString(properties.street),
  ].filter(Boolean);
  const locality = getString(properties.city) ?? getString(properties.district);
  const region = getString(properties.state);
  const postalCode = getString(properties.postcode);

  const parts = [
    streetParts.join(" "),
    locality,
    [region, postalCode].filter(Boolean).join(" "),
    getString(properties.country),
  ].filter((part) => part && part !== name);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

function buildCategory(properties: NonNullable<PhotonFeature["properties"]>) {
  const osmKey = getString(properties.osm_key);
  const osmValue = getString(properties.osm_value);
  if (osmKey && osmValue) return `${osmKey}:${osmValue}`;
  return osmKey ?? getString(properties.type);
}

function buildId(
  properties: NonNullable<PhotonFeature["properties"]>,
  coordinate: Coordinate,
  name: string,
) {
  const osmType = getString(properties.osm_type);
  const osmId =
    typeof properties.osm_id === "number" || typeof properties.osm_id === "string"
      ? String(properties.osm_id)
      : undefined;

  if (osmType && osmId) return `photon:${osmType}:${osmId}`;
  return `photon:${name}:${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`;
}
