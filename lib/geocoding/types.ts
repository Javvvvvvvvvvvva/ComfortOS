import type { Coordinate } from "@/lib/geo/types";

export type PlaceResult = {
  id: string;
  name: string;
  address?: string;
  coordinate: Coordinate;
  category?: string;
};

export interface GeocodingProvider {
  search(query: string, proximity?: Coordinate): Promise<PlaceResult[]>;
  reverseGeocode(coordinate: Coordinate): Promise<PlaceResult | null>;
}
