import { buildMapboxStaticTileUrl } from "@/lib/map/basemap";

const DEFAULT_TIMEOUT_MS = 8_000;

type TileRouteContext = {
  params: Promise<{ z: string; x: string; y: string }> | { z: string; x: string; y: string };
};

export async function GET(_request: Request, context: TileRouteContext) {
  const { z: rawZ, x: rawX, y: rawY } = await context.params;
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN?.trim() ?? "";

  if (process.env.NEXT_PUBLIC_BASEMAP_PROVIDER !== "mapbox-managed" || !accessToken) {
    return Response.json(
      { error: "Managed basemap unavailable." },
      { status: 503, headers: privateNoStoreHeaders() },
    );
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = buildMapboxStaticTileUrl({
      z: Number(rawZ),
      x: Number(rawX),
      y: Number(rawY),
      accessToken,
      baseUrl: process.env.MAPBOX_STYLES_BASE_URL,
      styleOwner: process.env.MAPBOX_MAP_STYLE_OWNER,
      styleId: process.env.MAPBOX_MAP_STYLE_ID,
    });
  } catch {
    return Response.json(
      { error: "Invalid map tile request." },
      { status: 400, headers: privateNoStoreHeaders() },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    parsePositiveInteger(process.env.BASEMAP_REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  );

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { accept: "image/avif,image/webp,image/png,image/*" },
      signal: controller.signal,
    });

    if (!upstream.ok || !upstream.body) {
      return Response.json(
        { error: "Managed basemap unavailable." },
        { status: upstream.status === 429 ? 429 : 502, headers: privateNoStoreHeaders() },
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "image/png";
    if (!contentType.startsWith("image/")) {
      return Response.json(
        { error: "Managed basemap returned an invalid response." },
        { status: 502, headers: privateNoStoreHeaders() },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Cache-Control": upstream.headers.get("cache-control") ?? "public, max-age=43200",
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "Managed basemap unavailable." },
      { status: 504, headers: privateNoStoreHeaders() },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function privateNoStoreHeaders() {
  return {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
