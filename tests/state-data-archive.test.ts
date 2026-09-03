import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  archiveState,
  createFilesystemObjectStore,
  validateReports,
  type StateArchiveOptions,
} from "@/scripts/archive-us-state-overture";

const RELEASE = "2026-08-19.0";

test("state archival requires accepted live and controlled route reports", async () => {
  const fixture = await createFixture();
  const onlyLive = [fixture.validationReports[0]];

  await assert.rejects(
    validateReports(onlyLive, "DC"),
    /At least two validation reports/,
  );

  const rejectedPath = path.join(fixture.root, "rejected.json");
  const rejected = JSON.parse(
    await fs.readFile(fixture.validationReports[1], "utf8"),
  );
  rejected.summary.accepted = false;
  await fs.writeFile(rejectedPath, JSON.stringify(rejected));
  await assert.rejects(
    validateReports([fixture.validationReports[0], rejectedPath], "DC"),
    /was not accepted/,
  );
});

test("state archival uploads, verifies, checkpoints, resumes, and prunes", async () => {
  const fixture = await createFixture();
  const store = createFilesystemObjectStore(fixture.archiveRoot);

  const first = await archiveState(fixture.options, store);
  assert.equal(first.uploadedObjectCount, 5);
  assert.equal(first.reusedObjectCount, 0);
  assert.equal(first.localDataPruned, false);
  assert.equal(
    JSON.parse(await fs.readFile(first.checkpointPath, "utf8")).archive
      .remoteVerified,
    true,
  );

  const resumed = await archiveState(fixture.options, store);
  assert.equal(resumed.uploadedObjectCount, 0);
  assert.equal(resumed.reusedObjectCount, 5);

  await assert.rejects(
    archiveState(
      { ...fixture.options, prune: true, confirmPrune: "wrong" },
      store,
    ),
    /--confirm-prune must be exactly/,
  );

  const pruned = await archiveState(
    {
      ...fixture.options,
      prune: true,
      confirmPrune: `DC@${RELEASE}`,
    },
    store,
  );
  assert.equal(pruned.localDataPruned, true);
  await assert.rejects(fs.stat(fixture.stateDataRoot), { code: "ENOENT" });
  assert.ok(pruned.checkpointPath);
  assert.equal(
    JSON.parse(await fs.readFile(pruned.checkpointPath, "utf8"))
      .localDataPruned,
    true,
  );
});

test("state archival refuses to overwrite a conflicting remote object", async () => {
  const fixture = await createFixture();
  const store = createFilesystemObjectStore(fixture.archiveRoot);
  const first = await archiveState(fixture.options, store);
  const manifestPath = path.join(fixture.archiveRoot, first.stateManifestKey);
  await fs.rm(manifestPath);
  const conflictingObject = path.join(
    fixture.archiveRoot,
    "overture-buildings",
    RELEASE,
    "us",
    "dc",
    "us-dc-test",
    "buildings.jsonl",
  );
  await fs.writeFile(conflictingObject, "different remote content\n");

  await assert.rejects(
    archiveState(fixture.options, store),
    /Immutable remote object conflict/,
  );
});

test("state archival dry-run validates all local checksums without uploading", async () => {
  const fixture = await createFixture();
  const result = await archiveState({ ...fixture.options, dryRun: true });

  assert.equal(result.dryRun, true);
  assert.equal(result.partitionCount, 1);
  assert.equal(result.objectCount, 4);
  await assert.rejects(fs.stat(fixture.archiveRoot), { code: "ENOENT" });
});

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "comfortos-archive-test-"));
  const planRoot = path.join(root, "plans");
  const dataRoot = path.join(root, "data");
  const archiveRoot = path.join(root, "archive");
  const checkpointRoot = path.join(root, "checkpoints");
  const stateDataRoot = path.join(dataRoot, "dc", RELEASE);
  const partitionRoot = path.join(stateDataRoot, "us-dc-test");
  await fs.mkdir(path.join(planRoot, "dc"), { recursive: true });
  await fs.mkdir(partitionRoot, { recursive: true });

  const buildings = "{\"id\":\"building-1\"}\n";
  const tileIndex = "{\"tile\":[0]}\n";
  const offsets = Buffer.alloc(12);
  await Promise.all([
    fs.writeFile(path.join(partitionRoot, "buildings.jsonl"), buildings),
    fs.writeFile(path.join(partitionRoot, "tile-index.json"), tileIndex),
    fs.writeFile(path.join(partitionRoot, "building-offsets.bin"), offsets),
  ]);
  await fs.writeFile(
    path.join(partitionRoot, "manifest.json"),
    `${JSON.stringify(
      {
        format: "comfortos-local-building-store-v1",
        release: RELEASE,
        region: "us-dc-test",
        bbox: [-77.25, 38.75, -77, 39],
        buildingCount: 1,
        explicitHeightCount: 1,
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
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    path.join(planRoot, "dc", "state-plan.json"),
    JSON.stringify({
      format: "comfortos-us-state-building-plan-v1",
      jurisdiction: { code: "DC", name: "District of Columbia" },
      partitionCount: 1,
      partitions: [
        { id: "us-dc-test", bbox: [-77.25, 38.75, -77, 39] },
      ],
    }),
  );

  const live = path.join(root, "dc-live.json");
  const heat = path.join(root, "dc-heat.json");
  await fs.writeFile(live, JSON.stringify(validationReport(null, "2026-09-03T10:00:00.000Z")));
  await fs.writeFile(heat, JSON.stringify(validationReport("heat", "2026-09-03T11:00:00.000Z")));
  const options: StateArchiveOptions = {
    state: "DC",
    release: RELEASE,
    planRoot,
    dataRoot,
    validationReports: [live, heat],
    prefix: "overture-buildings",
    checkpointRoot,
    prune: false,
    dryRun: false,
  };
  return {
    root,
    archiveRoot,
    stateDataRoot,
    validationReports: [live, heat],
    options,
  };
}

function validationReport(controlledWeather: string | null, createdAt: string) {
  return {
    createdAt,
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
