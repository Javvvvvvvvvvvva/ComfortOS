import { NextResponse } from "next/server";
import { MINNEAPOLIS_CENTER } from "@/lib/geo/types";
import { isValidCoordinate } from "@/lib/geo/validation";
import { PhotonGeocodingProvider } from "@/lib/geocoding/providers/photonProvider";
import { normalizeSearchQuery, shouldRequestSearch } from "@/lib/search/searchBehavior";

const DEFAULT_PHOTON_BASE_URL = "https://photon.komoot.io";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = normalizeSearchQuery(url.searchParams.get("q") ?? "");

    if (!shouldRequestSearch(query)) {
      return NextResponse.json({ places: [] });
    }

    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    const proximity = isValidCoordinate({ latitude: lat, longitude: lon })
      ? { latitude: lat, longitude: lon }
      : MINNEAPOLIS_CENTER;

    const provider = new PhotonGeocodingProvider({
      baseUrl: process.env.GEOCODING_BASE_URL ?? DEFAULT_PHOTON_BASE_URL,
      countryCode: process.env.GEOCODING_COUNTRY_CODE ?? "US",
    });
    const places = await provider.search(query, proximity);

    return NextResponse.json({ places });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to search places.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
