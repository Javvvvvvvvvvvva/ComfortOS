import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const REGION_CONFIG = "config/data-regions/minneapolis.json";
const DEFAULT_OUTPUT_DIR = "/tmp/comfortos-overture-minneapolis-store";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = options.output ?? DEFAULT_OUTPUT_DIR;
  const workDir =
    options.workDir ??
    (await fs.mkdtemp(path.join(os.tmpdir(), "comfortos-overture-minneapolis-")));
  const release = options.release ?? "latest";
  const rawPath = path.join(workDir, "minneapolis-buildings.geojsonseq");
  const metadataPath = path.join(workDir, "overture-extraction-metadata.json");

  await fs.mkdir(workDir, { recursive: true });

  const extraction = spawnSync(
    ".venv/bin/python",
    [
      "scripts/extract-overture-buildings-duckdb.py",
      "--region-config",
      REGION_CONFIG,
      "--output-geojsonseq",
      rawPath,
      "--metadata-output",
      metadataPath,
      "--release",
      release,
    ],
    { stdio: "inherit" },
  );

  if (extraction.error && "code" in extraction.error && extraction.error.code === "ENOENT") {
    throw new Error(
      [
        "Python DuckDB environment is unavailable.",
        "Create it with `python3 -m venv .venv` and `.venv/bin/pip install duckdb`.",
        "No fixture fallback was used.",
      ].join(" "),
    );
  }

  if (extraction.status !== 0) {
    throw new Error("Real Overture extraction failed. No fixture fallback was used.");
  }

  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8")) as {
    release: string;
    bbox: [number, number, number, number];
    license: string;
    sourceUrl: string;
    sourceAccessMethod: string;
    buildingPartCount: number;
    invalidGeometryCount: number;
  };
  const bbox = metadata.bbox.join(",");
  const ingest = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/ingest-overture-buildings.ts",
      "--input",
      rawPath,
      "--output",
      outputDir,
      "--region",
      "minneapolis-validation",
      "--bounds",
      bbox,
      "--release",
      metadata.release,
      "--license",
      metadata.license,
      "--source-url",
      metadata.sourceUrl,
      "--source-access-method",
      metadata.sourceAccessMethod,
      "--building-part-count",
      String(metadata.buildingPartCount),
      "--invalid-geometry-count",
      String(metadata.invalidGeometryCount),
    ],
    { stdio: "inherit" },
  );

  if (ingest.status !== 0) {
    throw new Error("Overture ingestion failed after download.");
  }
}

function parseArgs(args: string[]) {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    }
    options[toCamelCase(key.slice(2))] = value;
  }
  return options;
}

function toCamelCase(value: string) {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
