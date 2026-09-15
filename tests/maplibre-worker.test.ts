import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("web map configures the MapLibre worker through the Vite worker pipeline", () => {
  const source = readFileSync(join(process.cwd(), "components/ComfortMap.tsx"), "utf8");

  assert.match(
    source,
    /maplibre-gl-worker\.mjs\?worker&url/,
    "MapLibre's module worker and its shared dependency must be bundled together",
  );
  assert.match(source, /setWorkerUrl\(maplibreWorkerUrl\)/);
  assert.ok(
    source.indexOf("setWorkerUrl(maplibreWorkerUrl)") <
      source.indexOf("new MapLibreMap"),
    "worker URL must be configured before a map creates the worker pool",
  );
});
