import { NextResponse } from "next/server";
import { createConfiguredGeocodingProvider } from "@/lib/geocoding/providers/configuredGeocodingProvider";
import { normalizeSearchQuery, shouldRequestSearch } from "@/lib/search/searchBehavior";
import { createRequestId, logServerEvent } from "@/lib/observability/serverLog";
import { API_RATE_LIMITS, checkRequestRateLimit } from "@/lib/api/rateLimit";
import {
  parseCoordinateBody,
  parseOptionalBodyString,
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
      { code: "RATE_LIMITED", error: "Too many place searches. Please try again shortly." },
      { status: 429, headers },
    );
  }
  try {
    const payload = requireJsonObject(await request.json());
    const query = normalizeSearchQuery(
      typeof payload.query === "string" ? payload.query : "",
    );

    if (!shouldRequestSearch(query)) {
      return NextResponse.json({ places: [] }, { headers });
    }

    const proximity = parseCoordinateBody(payload.proximity) ?? undefined;
    const sessionToken = parseOptionalBodyString(payload.sessionToken, 128);

    const configured = createConfiguredGeocodingProvider();
    const places = await configured.provider.search(query, proximity, {
      sessionToken,
      signal: request.signal,
    });

    logServerEvent("info", "geocoding_search_complete", {
      requestId,
      provider: configured.metadata.id,
      providerMode: configured.metadata.mode,
      latencyMs: Math.round(performance.now() - startedAt),
      resultCount: places.length,
    });

    return NextResponse.json({ places }, { headers });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid place search request." },
        { status: 400, headers },
      );
    }
    logServerEvent("warn", "geocoding_search_failed", {
      requestId,
      failureCategory: "geocoding_provider",
      latencyMs: Math.round(performance.now() - startedAt),
    });
    return NextResponse.json(
      { error: "Unable to search places." },
      { status: 503, headers },
    );
  }
}
