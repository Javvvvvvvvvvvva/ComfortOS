import { NextResponse } from "next/server";
import { createConfiguredGeocodingProvider } from "@/lib/geocoding/providers/configuredGeocodingProvider";
import { assertValidCoordinate } from "@/lib/geo/validation";
import { createRequestId, logServerEvent } from "@/lib/observability/serverLog";

export async function GET(request: Request) {
  const requestId = createRequestId(request);
  const startedAt = performance.now();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Request-Id": requestId,
  };
  try {
    const url = new URL(request.url);
    const coordinate = {
      latitude: Number(url.searchParams.get("lat")),
      longitude: Number(url.searchParams.get("lon")),
    };
    assertValidCoordinate(coordinate, "Reverse geocode coordinate");

    const configured = createConfiguredGeocodingProvider();
    const place = await configured.provider.reverseGeocode(coordinate, {
      signal: request.signal,
    });

    logServerEvent("info", "reverse_geocoding_complete", {
      requestId,
      provider: configured.metadata.id,
      providerMode: configured.metadata.mode,
      latencyMs: Math.round(performance.now() - startedAt),
      found: place !== null,
    });

    return NextResponse.json({ place }, { headers });
  } catch {
    logServerEvent("warn", "reverse_geocoding_failed", {
      requestId,
      failureCategory: "geocoding_provider",
      latencyMs: Math.round(performance.now() - startedAt),
    });
    return NextResponse.json(
      { error: "Unable to identify this location." },
      { status: 503, headers },
    );
  }
}
