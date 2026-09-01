import { NextResponse } from "next/server";
import { isValidCoordinate } from "@/lib/geo/validation";
import { createConfiguredGeocodingProvider } from "@/lib/geocoding/providers/configuredGeocodingProvider";
import { normalizeSearchQuery, shouldRequestSearch } from "@/lib/search/searchBehavior";
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
    const query = normalizeSearchQuery(url.searchParams.get("q") ?? "");

    if (!shouldRequestSearch(query)) {
      return NextResponse.json({ places: [] }, { headers });
    }

    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    const proximity = isValidCoordinate({ latitude: lat, longitude: lon })
      ? { latitude: lat, longitude: lon }
      : undefined;
    const sessionToken = url.searchParams.get("session")?.trim();

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
  } catch {
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
