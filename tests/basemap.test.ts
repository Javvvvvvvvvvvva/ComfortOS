import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMapboxStaticTileUrl,
  createBasemapStyle,
  isValidMapTileCoordinate,
} from "@/lib/map/basemap";

test("managed basemap keeps Mapbox credentials behind the same-origin tile route", () => {
  const style = createBasemapStyle({ provider: "mapbox-managed" });
  const source = style.sources.basemap;

  assert.equal(source.type, "raster");
  assert.deepEqual("tiles" in source ? source.tiles : undefined, [
    "/api/map/tiles/{z}/{x}/{y}",
  ]);
  assert.equal("tileSize" in source ? source.tileSize : undefined, 512);
  assert.equal(JSON.stringify(style).includes("access_token"), false);
});

test("Mapbox tile URL validation rejects out-of-range coordinates", () => {
  assert.equal(isValidMapTileCoordinate(0, 0, 0), true);
  assert.equal(isValidMapTileCoordinate(4, 15, 15), true);
  assert.equal(isValidMapTileCoordinate(4, 16, 0), false);
  assert.equal(isValidMapTileCoordinate(23, 0, 0), false);
});

test("Mapbox tile URL is assembled only on the server helper", () => {
  const url = buildMapboxStaticTileUrl({
    z: 12,
    x: 988,
    y: 1453,
    accessToken: "test-token",
  });

  assert.equal(
    url.origin + url.pathname,
    "https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/12/988/1453",
  );
  assert.equal(url.searchParams.get("access_token"), "test-token");
});
