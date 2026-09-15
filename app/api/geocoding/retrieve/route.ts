import { NextResponse } from "next/server";
import { createConfiguredGeocodingProvider } from "@/lib/geocoding/providers/configuredGeocodingProvider";
import { createRequestId, logServerEvent } from "@/lib/observability/serverLog";
import { API_RATE_LIMITS, checkRequestRateLimit } from "@/lib/api/rateLimit";

export async function GET(request: Request) {
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
    const url = new URL(request.url);
    const suggestionId = url.searchParams.get("id")?.trim() ?? "";
    const sessionToken = url.searchParams.get("session")?.trim();
    if (!suggestionId) {
      return NextResponse.json(
        { error: "A place selection is required." },
        { status: 400, headers },
      );
    }

    const configured = createConfiguredGeocodingProvider();
    const place = await configured.provider.retrieve(suggestionId, {
      sessionToken,
      signal: request.signal,
    });

    logServerEvent("info", "geocoding_retrieve_complete", {
      requestId,
      provider: configured.metadata.id,
      providerMode: configured.metadata.mode,
      latencyMs: Math.round(performance.now() - startedAt),
    });

    return NextResponse.json({ place }, { headers });
  } catch {
    logServerEvent("warn", "geocoding_retrieve_failed", {
      requestId,
      failureCategory: "geocoding_provider",
      latencyMs: Math.round(performance.now() - startedAt),
    });
    return NextResponse.json(
      { error: "Unable to load the selected place." },
      { status: 503, headers },
    );
  }
}
