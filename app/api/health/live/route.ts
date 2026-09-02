import { NextResponse } from "next/server";
import { createConfiguredRoutingProvider } from "@/lib/routing/providers/configuredRoutingProvider";
import { RoutingService } from "@/lib/routing/service";
import { buildMapboxStaticTileUrl } from "@/lib/map/basemap";
import { createRequestId, logServerEvent } from "@/lib/observability/serverLog";

type LiveCheck = {
  ok: boolean;
  latencyMs: number;
  mode: string;
  required: boolean;
};

export async function GET(request: Request) {
  const requestId = createRequestId(request);
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Request-Id": requestId,
  };
  const expectedToken = process.env.HEALTHCHECK_TOKEN?.trim() ?? "";

  if (process.env.NODE_ENV === "production" && !expectedToken) {
    return NextResponse.json(
      { status: "not-ready", error: "Live health authentication is not configured." },
      { status: 503, headers },
    );
  }
  if (expectedToken && request.headers.get("authorization") !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers });
  }

  const [routing, weather, buildings, coveredFeatures, basemap] = await Promise.all([
    checkRouting(request.signal),
    checkWeather(request.signal),
    checkBuildings(request.signal),
    checkCoveredFeatures(request.signal),
    checkBasemap(request.signal),
  ]);
  const checks = { routing, weather, buildings, coveredFeatures, basemap };
  const ready = Object.values(checks).every((check) => !check.required || check.ok);

  logServerEvent(ready ? "info" : "warn", "live_health_complete", {
    requestId,
    ready,
    routingReady: routing.ok,
    weatherReady: weather.ok,
    buildingsReady: buildings.ok,
    coveredFeaturesReady: coveredFeatures.ok,
    basemapReady: basemap.ok,
    latencyMs: Math.max(...Object.values(checks).map((check) => check.latencyMs)),
  });

  return NextResponse.json(
    { status: ready ? "ready" : "not-ready", checks },
    { status: ready ? 200 : 503, headers },
  );
}

async function checkCoveredFeatures(signal: AbortSignal): Promise<LiveCheck> {
  const startedAt = performance.now();
  const required = process.env.REQUIRE_RAIN_COVER === "true";
  const mode = process.env.COVERED_FEATURE_PROVIDER ?? "disabled";
  if (!required) return liveCheck(true, startedAt, mode, false);
  const baseUrl = process.env.COVERED_FEATURE_QUERY_SERVICE_URL?.replace(/\/$/, "") ?? "";
  if (mode !== "covered-query-service" || !baseUrl) {
    return liveCheck(false, startedAt, mode, true);
  }
  try {
    const response = await boundedFetch(
      `${baseUrl}/health`,
      {
        headers: process.env.COVERED_FEATURE_QUERY_SERVICE_TOKEN
          ? { authorization: `Bearer ${process.env.COVERED_FEATURE_QUERY_SERVICE_TOKEN}` }
          : undefined,
        signal,
      },
      5_000,
    );
    if (!response.ok) return liveCheck(false, startedAt, mode, true);
    const payload = (await response.json()) as {
      capabilities?: { coveredFeatures?: boolean };
    };
    return liveCheck(
      payload.capabilities?.coveredFeatures === true,
      startedAt,
      mode,
      true,
    );
  } catch {
    return liveCheck(false, startedAt, mode, true);
  }
}

async function checkRouting(signal: AbortSignal): Promise<LiveCheck> {
  const startedAt = performance.now();
  try {
    const { provider, mode } = createConfiguredRoutingProvider();
    const health = await new RoutingService(provider).checkProviderHealth({ signal });
    return liveCheck(Boolean(health?.ok), startedAt, mode, true);
  } catch {
    return liveCheck(false, startedAt, process.env.ROUTING_PROVIDER ?? "unconfigured", true);
  }
}

async function checkWeather(signal: AbortSignal): Promise<LiveCheck> {
  const startedAt = performance.now();
  const userAgent = process.env.WEATHER_USER_AGENT?.trim() ?? "";
  if (!userAgent) return liveCheck(false, startedAt, "nws", true);
  try {
    const response = await boundedFetch(
      `${(process.env.WEATHER_BASE_URL ?? "https://api.weather.gov").replace(/\/$/, "")}/points/39,-96`,
      {
        headers: { accept: "application/geo+json", "user-agent": userAgent },
        signal,
      },
      6_000,
    );
    return liveCheck(response.ok, startedAt, "nws", true);
  } catch {
    return liveCheck(false, startedAt, "nws", true);
  }
}

async function checkBuildings(signal: AbortSignal): Promise<LiveCheck> {
  const startedAt = performance.now();
  const mode = process.env.BUILDING_PROVIDER ?? "unconfigured";
  const baseUrl = process.env.BUILDING_QUERY_SERVICE_URL?.replace(/\/$/, "") ?? "";
  if (!baseUrl || (mode !== "building-query-service" && mode !== "http-overture")) {
    return liveCheck(false, startedAt, mode, true);
  }
  try {
    const response = await boundedFetch(
      `${baseUrl}/health`,
      {
        headers: process.env.BUILDING_QUERY_SERVICE_TOKEN
          ? { authorization: `Bearer ${process.env.BUILDING_QUERY_SERVICE_TOKEN}` }
          : undefined,
        signal,
      },
      5_000,
    );
    return liveCheck(response.ok, startedAt, mode, true);
  } catch {
    return liveCheck(false, startedAt, mode, true);
  }
}

async function checkBasemap(signal: AbortSignal): Promise<LiveCheck> {
  const startedAt = performance.now();
  const mode = process.env.NEXT_PUBLIC_BASEMAP_PROVIDER ?? "osm-community";
  if (mode === "mapbox-managed") {
    try {
      const url = buildMapboxStaticTileUrl({
        z: 0,
        x: 0,
        y: 0,
        accessToken: process.env.MAPBOX_ACCESS_TOKEN ?? "",
        baseUrl: process.env.MAPBOX_STYLES_BASE_URL,
        styleOwner: process.env.MAPBOX_MAP_STYLE_OWNER,
        styleId: process.env.MAPBOX_MAP_STYLE_ID,
      });
      const response = await boundedFetch(url, { signal }, 6_000);
      return liveCheck(
        response.ok && (response.headers.get("content-type") ?? "").startsWith("image/"),
        startedAt,
        mode,
        true,
      );
    } catch {
      return liveCheck(false, startedAt, mode, true);
    }
  }

  const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE ?? "";
  if (!tileUrl || mode !== "custom") return liveCheck(false, startedAt, mode, true);
  try {
    const response = await boundedFetch(
      tileUrl.replace("{z}", "0").replace("{x}", "0").replace("{y}", "0"),
      { signal },
      6_000,
    );
    return liveCheck(response.ok, startedAt, mode, true);
  } catch {
    return liveCheck(false, startedAt, mode, true);
  }
}

function liveCheck(
  ok: boolean,
  startedAt: number,
  mode: string,
  required: boolean,
): LiveCheck {
  return { ok, latencyMs: Math.round(performance.now() - startedAt), mode, required };
}

async function boundedFetch(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}
