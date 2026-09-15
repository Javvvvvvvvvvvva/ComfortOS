import { Platform } from "react-native";
import type {
  ComfortComparison,
  Coordinate,
  Place,
  PlaceSuggestion,
  RouteRequest,
  RouteResult,
  WeatherBundle,
} from "../types";
import { requestJson } from "./request";

const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const developmentBaseUrl = __DEV__
  ? Platform.OS === "android"
    ? "http://10.0.2.2:3000"
    : "http://localhost:3000"
  : "";

export const API_BASE_URL = (
  configuredBaseUrl || developmentBaseUrl
).replace(/\/$/, "");
export const PRODUCT_SITE_URL = (
  process.env.EXPO_PUBLIC_SITE_URL?.trim() || API_BASE_URL
).replace(/\/$/, "");

export function productUrl(path: string) {
  if (!PRODUCT_SITE_URL) {
    throw new Error("EXPO_PUBLIC_SITE_URL is required for product information links.");
  }
  return new URL(path, `${PRODUCT_SITE_URL}/`).toString();
}

export async function searchPlaces(
  query: string,
  proximity: Coordinate | undefined,
  sessionToken: string,
  signal?: AbortSignal,
) {
  const url = apiUrl("/api/geocoding/search");
  url.searchParams.set("q", query);
  url.searchParams.set("session", sessionToken);
  if (proximity) {
    url.searchParams.set("lat", String(proximity.latitude));
    url.searchParams.set("lon", String(proximity.longitude));
  }
  const payload = await requestJson<{ places?: PlaceSuggestion[]; error?: string }>(url, {
    signal,
  });
  if (!payload.places) throw new Error(payload.error ?? "Unable to search places.");
  return payload.places;
}

export async function retrievePlace(
  id: string,
  sessionToken: string,
  signal?: AbortSignal,
) {
  const url = apiUrl("/api/geocoding/retrieve");
  url.searchParams.set("id", id);
  url.searchParams.set("session", sessionToken);
  const payload = await requestJson<{ place?: Place; error?: string }>(url, { signal });
  if (!payload.place) throw new Error(payload.error ?? "Unable to load this place.");
  return payload.place;
}

export async function reverseGeocode(coordinate: Coordinate, signal?: AbortSignal) {
  const url = apiUrl("/api/geocoding/reverse");
  url.searchParams.set("lat", String(coordinate.latitude));
  url.searchParams.set("lon", String(coordinate.longitude));
  const payload = await requestJson<{ place?: Place | null; error?: string }>(url, { signal });
  return payload.place ?? null;
}

export async function getWeather(coordinate: Coordinate, signal?: AbortSignal) {
  const url = apiUrl("/api/weather");
  url.searchParams.set("lat", String(coordinate.latitude));
  url.searchParams.set("lon", String(coordinate.longitude));
  const payload = await requestJson<{ weather?: WeatherBundle; error?: string }>(url, { signal });
  if (!payload.weather) throw new Error(payload.error ?? "Live conditions unavailable.");
  return payload.weather;
}

export async function getFastestRoute(request: RouteRequest, signal?: AbortSignal) {
  const payload = await requestJson<{ route?: RouteResult; error?: string }>(
    apiUrl("/api/routes/walking"),
    jsonRequest(request, signal),
  );
  if (!payload.route) throw new Error(payload.error ?? "Unable to calculate a walking route.");
  return payload.route;
}

export async function getComfortComparison(request: RouteRequest, signal?: AbortSignal) {
  const payload = await requestJson<{ comparison?: ComfortComparison; error?: string }>(
    apiUrl("/api/routes/comfort-comparison"),
    jsonRequest(request, signal),
  );
  if (!payload.comparison) {
    throw new Error(payload.error ?? "Unable to compare walking routes.");
  }
  return payload.comparison;
}

function apiUrl(path: string) {
  if (!API_BASE_URL) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is required for a release build.");
  }
  return new URL(path, `${API_BASE_URL}/`);
}

function jsonRequest(body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  };
}
