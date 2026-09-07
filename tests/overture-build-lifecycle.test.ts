import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { removeOwnedWorkDirectory } from "../scripts/build-overture-buildings";

test("owned Overture work directories are removed after a build", async () => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "comfortos-build-cleanup-"));
  await fs.writeFile(path.join(workDir, "raw.geojsonseq"), "temporary");

  await removeOwnedWorkDirectory(workDir, true);

  await assert.rejects(fs.access(workDir));
});

test("explicit Overture work directories remain available to callers", async () => {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "comfortos-build-explicit-"));

  try {
    await removeOwnedWorkDirectory(workDir, false);
    await fs.access(workDir);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
});
