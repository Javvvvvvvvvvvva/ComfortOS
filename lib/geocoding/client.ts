import type { Coordinate } from "@/lib/geo/types";
import type { PlaceResult, PlaceSuggestion } from "@/lib/geocoding/types";

export async function searchPlaces(
  query: string,
  proximity?: Coordinate,
  sessionToken?: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const url = new URL("/api/geocoding/search", window.location.origin);
  url.searchParams.set("q", query);

  if (proximity) {
    url.searchParams.set("lat", String(proximity.latitude));
    url.searchParams.set("lon", String(proximity.longitude));
  }
  if (sessionToken) url.searchParams.set("session", sessionToken);

  const response = await fetch(url, { signal, cache: "no-store" });
  const payload = (await response.json()) as {
    places?: PlaceSuggestion[];
    error?: string;
  };

  if (!response.ok || !payload.places) {
    throw new Error(payload.error ?? "Unable to search places.");
  }

  return payload.places;
}

export async function retrievePlace(
  suggestionId: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<PlaceResult> {
  const url = new URL("/api/geocoding/retrieve", window.location.origin);
  url.searchParams.set("id", suggestionId);
  url.searchParams.set("session", sessionToken);

  const response = await fetch(url, { signal, cache: "no-store" });
  const payload = (await response.json()) as {
    place?: PlaceResult;
    error?: string;
  };

  if (!response.ok || !payload.place) {
    throw new Error(payload.error ?? "Unable to load the selected place.");
  }

  return payload.place;
}

export async function reverseGeocode(
  coordinate: Coordinate,
  signal?: AbortSignal,
): Promise<PlaceResult | null> {
  const url = new URL("/api/geocoding/reverse", window.location.origin);
  url.searchParams.set("lat", String(coordinate.latitude));
  url.searchParams.set("lon", String(coordinate.longitude));

  const response = await fetch(url, { signal, cache: "no-store" });
  const payload = (await response.json()) as {
    place?: PlaceResult | null;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to identify this location.");
  }

  return payload.place ?? null;
}
