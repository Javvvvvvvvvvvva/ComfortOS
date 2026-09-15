import { NextResponse } from "next/server";
import { createConfiguredGeocodingProvider } from "@/lib/geocoding/providers/configuredGeocodingProvider";
import { createRequestId, logServerEvent } from "@/lib/observability/serverLog";
import { API_RATE_LIMITS, checkRequestRateLimit } from "@/lib/api/rateLimit";
import {
  parseCoordinateBody,
  requireJsonObject,
} from "@/lib/api/locationRequestBody";

export async function POST(request: Request) {
  const requestId = createRequestId(request);
  const startedAt = performance.now();
  const rateLimit = checkRequestRateLimit(request, API_RATE_LIMITS.geocoding);
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Request-Id": requestId,
    ...rateLimit.headers,
  };
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { code: "RATE_LIMITED", error: "Too many place requests. Please try again shortly." },
      { status: 429, headers },
    );
  }
  try {
    const payload = requireJsonObject(await request.json());
    const coordinate = parseCoordinateBody(payload.coordinate);
    if (!coordinate) {
      return NextResponse.json(
        { error: "Invalid reverse geocode coordinate." },
        { status: 400, headers },
      );
    }

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
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid reverse geocode request." },
        { status: 400, headers },
      );
    }
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
