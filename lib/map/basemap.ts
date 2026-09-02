import type { StyleSpecification } from "maplibre-gl";

export type BasemapProviderMode = "osm-community" | "mapbox-managed" | "custom";

export type BasemapStyleOptions = {
  provider?: string;
  tileUrlTemplate?: string;
  attribution?: string;
};

const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export function createBasemapStyle(options: BasemapStyleOptions): StyleSpecification {
  const mode = normalizeBasemapProvider(options.provider);
  const tileUrl =
    mode === "mapbox-managed"
      ? "/api/map/tiles/{z}/{x}/{y}"
      : options.tileUrlTemplate?.trim() || OSM_TILE_URL;
  const attribution =
    options.attribution?.trim() ||
    (mode === "mapbox-managed"
      ? "© Mapbox © OpenStreetMap contributors"
      : "© OpenStreetMap contributors");

  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [tileUrl],
        tileSize: mode === "mapbox-managed" ? 512 : 256,
        attribution,
      },
    },
    layers: [
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
      },
    ],
  };
}

export function normalizeBasemapProvider(value?: string): BasemapProviderMode {
  if (value === "mapbox-managed") return value;
  if (value === "custom") return value;
  return "osm-community";
}

export function isValidMapTileCoordinate(z: number, x: number, y: number) {
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 22) return false;
  const dimension = 2 ** z;
  return x >= 0 && x < dimension && y >= 0 && y < dimension;
}

export function buildMapboxStaticTileUrl({
  z,
  x,
  y,
  accessToken,
  baseUrl = "https://api.mapbox.com/styles/v1",
  styleOwner = "mapbox",
  styleId = "streets-v12",
}: {
  z: number;
  x: number;
  y: number;
  accessToken: string;
  baseUrl?: string;
  styleOwner?: string;
  styleId?: string;
}) {
  if (!isValidMapTileCoordinate(z, x, y)) {
    throw new Error("Invalid map tile coordinate.");
  }
  if (!accessToken.trim()) throw new Error("Mapbox access token is required.");
  if (!/^[a-z0-9_-]+$/i.test(styleOwner) || !/^[a-z0-9_-]+$/i.test(styleId)) {
    throw new Error("Invalid Mapbox style identifier.");
  }

  const url = new URL(
    `${baseUrl.replace(/\/$/, "")}/${styleOwner}/${styleId}/tiles/512/${z}/${x}/${y}`,
  );
  url.searchParams.set("access_token", accessToken);
  return url;
}
