import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_OUTPUT_ROOT = "/tmp";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const region = options.region ?? "minneapolis";
  const regionConfig = options.regionConfig ?? `config/data-regions/${region}.json`;
  const outputDir =
    options.output ?? path.join(DEFAULT_OUTPUT_ROOT, `comfortos-overture-${region}-store`);
  const workDir =
    options.workDir ??
    (await fs.mkdtemp(path.join(os.tmpdir(), `comfortos-overture-${region}-`)));
  const release = options.release ?? "latest";
  const rawPath = path.join(workDir, `${region}-buildings.geojsonseq`);
  const metadataPath = path.join(workDir, "overture-extraction-metadata.json");

  await fs.mkdir(workDir, { recursive: true });

  const extraction = spawnSync(
    ".venv/bin/python",
    [
      "scripts/extract-overture-buildings-duckdb.py",
      "--region-config",
      regionConfig,
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
    region: string;
    release: string;
    bbox: [number, number, number, number];
    license: string;
    sourceUrl: string;
    sourceAccessMethod: string;
    buildingPartCount: number;
    invalidGeometryCount: number;
  };
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
      metadata.region,
      "--bounds",
      metadata.bbox.join(","),
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
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith("--")) throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}.`);
    }
    options[toCamelCase(key.slice(2))] = value;
    index += 1;
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
