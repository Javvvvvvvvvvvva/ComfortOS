import type { Coordinate } from "@/lib/geo/types";

export type PlaceResult = {
  id: string;
  name: string;
  address?: string;
  coordinate: Coordinate;
  category?: string;
};

export type PlaceSuggestion = Omit<PlaceResult, "coordinate"> & {
  coordinate?: Coordinate;
};

export type GeocodingRequestOptions = {
  sessionToken?: string;
  signal?: AbortSignal;
};

export type GeocodingProviderMetadata = {
  id: string;
  name: string;
  mode: "public-demo" | "managed" | "self-hosted";
  endpointFamily: string;
  productionEligible: boolean;
};

export interface GeocodingProvider {
  search(
    query: string,
    proximity?: Coordinate,
    options?: GeocodingRequestOptions,
  ): Promise<PlaceSuggestion[]>;
  retrieve(
    suggestionId: string,
    options?: GeocodingRequestOptions,
  ): Promise<PlaceResult>;
  reverseGeocode(
    coordinate: Coordinate,
    options?: GeocodingRequestOptions,
  ): Promise<PlaceResult | null>;
}
