import type { Coordinate } from "@/lib/geo/types";
import type { PlaceResult } from "@/lib/geocoding/types";

export async function searchPlaces(
  query: string,
  proximity?: Coordinate,
  signal?: AbortSignal,
): Promise<PlaceResult[]> {
  const url = new URL("/api/geocoding/search", window.location.origin);
  url.searchParams.set("q", query);

  if (proximity) {
    url.searchParams.set("lat", String(proximity.latitude));
    url.searchParams.set("lon", String(proximity.longitude));
  }

  const response = await fetch(url, { signal });
  const payload = (await response.json()) as {
    places?: PlaceResult[];
    error?: string;
  };

  if (!response.ok || !payload.places) {
    throw new Error(payload.error ?? "Unable to search places.");
  }

  return payload.places;
}

export async function reverseGeocode(
  coordinate: Coordinate,
  signal?: AbortSignal,
): Promise<PlaceResult | null> {
  const url = new URL("/api/geocoding/reverse", window.location.origin);
  url.searchParams.set("lat", String(coordinate.latitude));
  url.searchParams.set("lon", String(coordinate.longitude));

  const response = await fetch(url, { signal });
  const payload = (await response.json()) as {
    place?: PlaceResult | null;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to identify this location.");
  }

  return payload.place ?? null;
}
