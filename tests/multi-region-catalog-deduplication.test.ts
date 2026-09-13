import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeCatalogBuildingStores,
  type CatalogBuildingStore,
} from "@/lib/environment/buildings/providers/multiRegionOvertureBuildingProvider";
import type { LocalOvertureStoreManifest } from "@/lib/environment/buildings/providers/localOvertureBuildingProvider";

const checksum = "a".repeat(64);
const manifest: LocalOvertureStoreManifest = {
  format: "comfortos-local-building-store-v1",
  source: "overture-buildings",
  release: "2026-08-19.0",
  createdAt: "2026-09-03T11:00:00.000Z",
  region: "us-dc-w0309-n0155",
  bbox: [-77.25, 38.75, -77, 39],
  tileSizeDegrees: 0.005,
  buildingCount: 1,
  explicitHeightCount: 0,
  floorDerivedHeightCount: 0,
  unknownHeightCount: 1,
  checksums: {
    buildingsSha256: checksum,
    tileIndexSha256: "b".repeat(64),
    buildingOffsetsSha256: "c".repeat(64),
  },
};

function store(storeDir: string, region: string): CatalogBuildingStore {
  return {
    storeDir,
    manifestSha256: "d".repeat(64),
    manifest: { ...manifest, region },
  };
}

test("catalog provider opens one copy of checksum-identical border partitions", () => {
  const stores = [
    store("/data/us/dc/partition", "us-dc-w0309-n0155"),
    store("/data/us/md/partition", "us-md-w0309-n0155"),
    store("/data/us/va/partition", "us-va-w0309-n0155"),
  ];
  assert.deepEqual(dedupeCatalogBuildingStores(stores), [stores[0]]);
});

test("catalog provider retains stores when any content checksum differs", () => {
  const first = store("/data/us/dc/partition", "us-dc-w0309-n0155");
  const second = store("/data/us/md/partition", "us-md-w0309-n0155");
  second.manifest = {
    ...second.manifest,
    checksums: {
      ...second.manifest.checksums!,
      tileIndexSha256: "e".repeat(64),
    },
  };
  assert.deepEqual(dedupeCatalogBuildingStores([first, second]), [first, second]);
});
