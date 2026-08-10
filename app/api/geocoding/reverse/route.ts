import { NextResponse } from "next/server";
import { PhotonGeocodingProvider } from "@/lib/geocoding/providers/photonProvider";
import { assertValidCoordinate } from "@/lib/geo/validation";

const DEFAULT_PHOTON_BASE_URL = "https://photon.komoot.io";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const coordinate = {
      latitude: Number(url.searchParams.get("lat")),
      longitude: Number(url.searchParams.get("lon")),
    };
    assertValidCoordinate(coordinate, "Reverse geocode coordinate");

    const provider = new PhotonGeocodingProvider({
      baseUrl: process.env.GEOCODING_BASE_URL ?? DEFAULT_PHOTON_BASE_URL,
      countryCode: process.env.GEOCODING_COUNTRY_CODE ?? "US",
    });
    const place = await provider.reverseGeocode(coordinate);

    return NextResponse.json({ place });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to identify this location.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
