import type { Coordinate } from "@/lib/geo/types";
import type { WeatherBundle } from "@/lib/weather/types";

export async function requestWeatherBundle(
  coordinate: Coordinate,
  signal?: AbortSignal,
): Promise<WeatherBundle> {
  const url = new URL("/api/weather", window.location.origin);
  url.searchParams.set("lat", String(coordinate.latitude));
  url.searchParams.set("lon", String(coordinate.longitude));

  const response = await fetch(url, { signal, cache: "no-store" });
  const payload = (await response.json()) as {
    weather?: WeatherBundle;
    error?: string;
  };

  if (!response.ok || !payload.weather) {
    throw new Error(payload.error ?? "Live conditions unavailable.");
  }

  return payload.weather;
}
