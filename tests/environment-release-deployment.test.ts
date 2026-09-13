import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadActiveBuildingDeployment } from "@/lib/environment/buildings/deploymentCatalog";
import { MultiRegionOvertureBuildingProvider } from "@/lib/environment/buildings/providers/multiRegionOvertureBuildingProvider";
import { activateEnvironmentRelease } from "@/scripts/activate-environment-release";
import {
  archiveState,
  createFilesystemObjectStore,
  type StateArchiveOptions,
} from "@/scripts/archive-us-state-overture";
import {
  restoreRelease,
  type ReleaseRestoreOptions,
} from "@/scripts/restore-us-overture-release";

const RELEASE = "2026-08-19.0";

test("release restore preflights, downloads, resumes, and builds a bounded catalog", async () => {
  const fixture = await createDeploymentFixture();
  const store = createFilesystemObjectStore(fixture.archiveRoot);

  const preflight = await restoreRelease(
    { ...fixture.restoreOptions, preflightOnly: true },
    store,
  );
  assert.equal(preflight.mode, "preflight");
  assert.equal(preflight.stateManifestCount, 1);
  assert.equal(preflight.objectCount, 4);
  await assert.rejects(fs.stat(fixture.targetRoot), { code: "ENOENT" });

  await assert.rejects(
    restoreRelease(fixture.restoreOptions, store),
    /--confirm-restore must be exactly/,
  );

  const restored = await restoreRelease(
    { ...fixture.restoreOptions, confirmRestore: RELEASE },
    store,
  );
  assert.equal(restored.mode, "restore");
  assert.equal(restored.downloadedObjectCount, 4);
  assert.equal(restored.reusedObjectCount, 0);
  assert.equal(restored.summary.jurisdictionCount, 1);
  assert.equal(restored.summary.storeCount, 1);

  const resumed = await restoreRelease(
    { ...fixture.restoreOptions, confirmRestore: RELEASE },
    store,
  );
  assert.equal(resumed.downloadedObjectCount, 0);
  assert.equal(resumed.reusedObjectCount, 4);
  assert.equal(resumed.catalogSha256, restored.catalogSha256);
});

test("release restore rejects a remote state manifest that differs from its checkpoint", async () => {
  const fixture = await createDeploymentFixture();
  assert.ok(fixture.checkpointPath);
  const checkpoint = JSON.parse(
    await fs.readFile(fixture.checkpointPath, "utf8"),
  );
  const stateManifestPath = path.join(
    fixture.archiveRoot,
    checkpoint.archive.stateManifestKey,
  );
  await fs.appendFile(stateManifestPath, " ");

  await assert.rejects(
    restoreRelease(
      { ...fixture.restoreOptions, preflightOnly: true },
      createFilesystemObjectStore(fixture.archiveRoot),
    ),
    /Remote state manifest checksum mismatch/,
  );
});

test("activation is explicit, immutable, and consumable by the environment service", async () => {
  const fixture = await createDeploymentFixture();
  const store = createFilesystemObjectStore(fixture.archiveRoot);
  await restoreRelease(
    { ...fixture.restoreOptions, confirmRestore: RELEASE },
    store,
  );
  const activationOptions = {
    targetRoot: fixture.targetRoot,
    release: RELEASE,
    deploymentId: "us-test-rc1",
    requiredJurisdictionCount: 1,
    dryRun: false,
  };

  const dryRun = await activateEnvironmentRelease({
    ...activationOptions,
    dryRun: true,
  });
  assert.equal(dryRun.mode, "dry-run");
  await assert.rejects(fs.stat(dryRun.activePath), { code: "ENOENT" });
  await assert.rejects(
    activateEnvironmentRelease(activationOptions),
    /--confirm-activation must be exactly/,
  );

  const activated = await activateEnvironmentRelease({
    ...activationOptions,
    confirmActivation: "us-test-rc1",
  });
  assert.equal(activated.mode, "activate");
  assert.equal(activated.reusedHistory, false);
  const active = loadActiveBuildingDeployment(activated.activePath);
  assert.equal(active.deployment.deploymentId, "us-test-rc1");
  assert.equal(active.catalog.summary.storeCount, 1);

  const provider = new MultiRegionOvertureBuildingProvider({
    catalogStores: active.stores,
    maxLoadedStores: 1,
  });
  assert.equal((await provider.getMetadata()).region, "us-dc-test");

  const repeated = await activateEnvironmentRelease({
    ...activationOptions,
    confirmActivation: "us-test-rc1",
  });
  assert.equal(repeated.reusedHistory, true);
});

test("active deployment rejects catalog and partition-manifest tampering", async () => {
  const fixture = await createDeploymentFixture();
  const store = createFilesystemObjectStore(fixture.archiveRoot);
  const restored = await restoreRelease(
    { ...fixture.restoreOptions, confirmRestore: RELEASE },
    store,
  );
  assert.ok(restored.catalogPath);
  const activated = await activateEnvironmentRelease({
    targetRoot: fixture.targetRoot,
    release: RELEASE,
    deploymentId: "us-test-tamper",
    requiredJurisdictionCount: 1,
    confirmActivation: "us-test-tamper",
    dryRun: false,
  });
  const active = loadActiveBuildingDeployment(activated.activePath);
  const partitionManifestPath = path.join(active.stores[0].storeDir, "manifest.json");
  await fs.appendFile(partitionManifestPath, " ");
  const provider = new MultiRegionOvertureBuildingProvider({
    catalogStores: active.stores,
  });
  await assert.rejects(
    provider.getBuildings({ west: -77.2, south: 38.8, east: -77.1, north: 38.9 }),
    /checksum mismatch for manifest.json/,
  );

  const activeManifest = JSON.parse(await fs.readFile(activated.activePath, "utf8"));
  const activeCatalogPath = path.join(
    fixture.targetRoot,
    activeManifest.catalogPath,
  );
  await fs.appendFile(activeCatalogPath, " ");
  assert.throws(
    () => loadActiveBuildingDeployment(activated.activePath),
    /catalog checksum mismatch/,
  );
});

async function createDeploymentFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "comfortos-deployment-test-"));
  const planRoot = path.join(root, "plans");
  const dataRoot = path.join(root, "data");
  const archiveRoot = path.join(root, "archive");
  const checkpointRoot = path.join(root, "checkpoints");
  const targetRoot = path.join(root, "target");
  const partitionRoot = path.join(dataRoot, "dc", RELEASE, "us-dc-test");
  await fs.mkdir(path.join(planRoot, "dc"), { recursive: true });
  await fs.mkdir(partitionRoot, { recursive: true });

  const buildings = "";
  const tileIndex = "{}\n";
  const offsets = Buffer.alloc(0);
  await Promise.all([
    fs.writeFile(path.join(partitionRoot, "buildings.jsonl"), buildings),
    fs.writeFile(path.join(partitionRoot, "tile-index.json"), tileIndex),
    fs.writeFile(path.join(partitionRoot, "building-offsets.bin"), offsets),
  ]);
  const partitionManifest = {
    format: "comfortos-local-building-store-v1",
    source: "overture-buildings",
    provider: "Overture Maps",
    release: RELEASE,
    theme: "buildings",
    type: "building",
    bbox: [-77.25, 38.75, -77, 39],
    license: "ODbL-1.0",
    createdAt: "2026-09-03T11:00:00.000Z",
    region: "us-dc-test",
    tileSizeDegrees: 0.005,
    buildingCount: 0,
    explicitHeightCount: 0,
    floorDerivedHeightCount: 0,
    unknownHeightCount: 0,
    invalidGeometryCount: 0,
    randomAccessIndex: {
      file: "building-offsets.bin",
      format: "uint64le-offset-uint32le-length-v1",
      recordSizeBytes: 12,
    },
    checksums: {
      buildingsSha256: sha256(buildings),
      tileIndexSha256: sha256(tileIndex),
      buildingOffsetsSha256: sha256(offsets),
    },
  };
  await fs.writeFile(
    path.join(partitionRoot, "manifest.json"),
    `${JSON.stringify(partitionManifest, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(planRoot, "dc", "state-plan.json"),
    JSON.stringify({
      format: "comfortos-us-state-building-plan-v1",
      jurisdiction: { code: "DC", name: "District of Columbia" },
      partitionCount: 1,
      partitions: [{ id: "us-dc-test", bbox: [-77.25, 38.75, -77, 39] }],
    }),
  );
  const live = path.join(root, "dc-live.json");
  const controlled = path.join(root, "dc-controlled.json");
  await fs.writeFile(live, JSON.stringify(validationReport(null)));
  await fs.writeFile(controlled, JSON.stringify(validationReport("heat")));
  const archiveOptions: StateArchiveOptions = {
    state: "DC",
    release: RELEASE,
    planRoot,
    dataRoot,
    validationReports: [live, controlled],
    prefix: "overture-buildings",
    checkpointRoot,
    prune: false,
    dryRun: false,
  };
  const archive = await archiveState(
    archiveOptions,
    createFilesystemObjectStore(archiveRoot),
  );
  const restoreOptions: ReleaseRestoreOptions = {
    release: RELEASE,
    states: ["DC"],
    checkpointRoot,
    targetRoot,
    prefix: "overture-buildings",
    dryRun: false,
    preflightOnly: false,
    minimumFreeBytes: 0,
  };
  return {
    archiveRoot,
    checkpointPath: archive.checkpointPath,
    restoreOptions,
    targetRoot,
  };
}

function validationReport(controlledWeather: string | null) {
  return {
    createdAt: "2026-09-03T11:00:00.000Z",
    controlledWeather,
    routingProvider: {
      id: "mapbox-directions-walking",
      mode: "managed",
      endpointFamily: "Directions API v5",
    },
    buildingProviderMode: "http-overture",
    summary: {
      routeCount: 1,
      successCount: 1,
      failureCount: 0,
      buildingQuerySuccessCount: 1,
      comparableRouteCount: 1,
      averageElapsedMs: 100,
      accepted: true,
    },
    rows: [{ id: "dc-route-1" }],
  };
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
