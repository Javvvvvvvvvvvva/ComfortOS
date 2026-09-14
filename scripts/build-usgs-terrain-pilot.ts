import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildUsgs3DepSampleUrl,
  deriveTerrainSegment,
  parseUsgs3DepSamples,
  USGS_3DEP_DATA_AS_OF,
  USGS_3DEP_IMAGE_SERVICE,
  USGS_3DEP_VERSION,
  type TerrainElevationSample,
} from "@/lib/environment/terrain/usgs3dep";
import type { Coordinate } from "@/lib/geo/types";

type RegionConfig = {
  id: string;
  label: string;
  bbox: [number, number, number, number];
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const regionConfigPath = path.resolve(
    requireOption(args.regionConfig, "--region-config"),
  );
  const output = path.resolve(
    args.output ?? path.join("/tmp", "comfortos-terrain-pilot"),
  );
  const gridSize = parseOddInteger(args.gridSize, 7, "--grid-size", 3, 31);
  const spacingMeters = parseNumber(
    args.spacingMeters,
    50,
    "--spacing-meters",
    10,
    1_000,
  );
  const region = parseRegion(
    JSON.parse(await fs.readFile(regionConfigPath, "utf8")),
  );
  const points = buildCenteredGrid(region.bbox, gridSize, spacingMeters);
  const response = await fetch(buildUsgs3DepSampleUrl(points), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`USGS 3DEP request failed with status ${response.status}.`);
  }
  const samples = parseUsgs3DepSamples(await response.json(), points);
  const terrain = summarizeTerrain(samples, gridSize);
  const samplesText = `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`;
  const generatedAt = new Date().toISOString();
  const manifest = {
    format: "comfortos-terrain-pilot-v1",
    mode: "research-pilot",
    generatedAt,
    region: {
      id: region.id,
      label: region.label,
      center: centerOfBounds(region.bbox),
    },
    source: {
      authority: "U.S. Geological Survey",
      dataset: "3D Elevation Program Bare Earth DEM",
      version: USGS_3DEP_VERSION,
      dataAsOf: USGS_3DEP_DATA_AS_OF,
      url: USGS_3DEP_IMAGE_SERVICE,
      license: "Public Domain",
    },
    grid: { size: gridSize, spacingMeters },
    sampleCount: samples.length,
    quality: {
      completeSampleRatio: samples.length / points.length,
      sourceResolutionMeters: sortedUnique(
        samples.map((sample) => sample.sourceResolutionMeters),
      ),
    },
    terrain,
    checksums: {
      samplesSha256: sha256(samplesText),
    },
    activation: {
      productionEligible: false,
      reason: "Pilot evidence only; route-cost integration requires multi-region calibration.",
    },
  };

  await fs.mkdir(output, { recursive: true });
  await writeAtomic(path.join(output, "terrain-samples.jsonl"), samplesText);
  await writeAtomic(
    path.join(output, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(JSON.stringify({ output, ...manifest }, null, 2));
}

export function buildCenteredGrid(
  bbox: [number, number, number, number],
  gridSize: number,
  spacingMeters: number,
) {
  const center = centerOfBounds(bbox);
  const centerOffset = (gridSize - 1) / 2;
  const latitudeDegreesPerMeter = 180 / (Math.PI * 6_371_008.8);
  const longitudeDegreesPerMeter =
    latitudeDegreesPerMeter /
    Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.01);
  const points: Coordinate[] = [];
  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      points.push({
        latitude:
          center.latitude +
          (centerOffset - row) * spacingMeters * latitudeDegreesPerMeter,
        longitude:
          center.longitude +
          (column - centerOffset) * spacingMeters * longitudeDegreesPerMeter,
      });
    }
  }
  return points;
}

export function summarizeTerrain(
  samples: TerrainElevationSample[],
  gridSize: number,
) {
  if (samples.length !== gridSize * gridSize) {
    throw new Error("Terrain sample grid is incomplete.");
  }
  const segments = [];
  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const index = row * gridSize + column;
      if (column + 1 < gridSize) {
        segments.push(deriveTerrainSegment(samples[index], samples[index + 1]));
      }
      if (row + 1 < gridSize) {
        segments.push(
          deriveTerrainSegment(samples[index], samples[index + gridSize]),
        );
      }
    }
  }
  const elevations = samples.map((sample) => sample.elevationMeters);
  return {
    minimumElevationMeters: Math.min(...elevations),
    maximumElevationMeters: Math.max(...elevations),
    elevationRangeMeters: Math.max(...elevations) - Math.min(...elevations),
    maximumSlopeDegrees: Math.max(...segments.map((segment) => segment.slopeDegrees)),
    meanSlopeDegrees:
      segments.reduce((total, segment) => total + segment.slopeDegrees, 0) /
      segments.length,
    maximumAbsoluteGrade: Math.max(...segments.map((segment) => Math.abs(segment.grade))),
  };
}

function parseRegion(value: unknown): RegionConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid region config.");
  }
  const region = value as Record<string, unknown>;
  if (
    typeof region.id !== "string" ||
    !region.id ||
    typeof region.label !== "string" ||
    !region.label ||
    !Array.isArray(region.bbox) ||
    region.bbox.length !== 4 ||
    !region.bbox.every((item) => typeof item === "number" && Number.isFinite(item)) ||
    region.bbox[0] >= region.bbox[2] ||
    region.bbox[1] >= region.bbox[3]
  ) {
    throw new Error("Invalid terrain pilot region config.");
  }
  return region as RegionConfig;
}

function centerOfBounds(bbox: [number, number, number, number]): Coordinate {
  return {
    longitude: (bbox[0] + bbox[2]) / 2,
    latitude: (bbox[1] + bbox[3]) / 2,
  };
}

function sortedUnique(values: number[]) {
  return [...new Set(values)].sort((left, right) => left - right);
}

async function writeAtomic(filePath: string, content: string) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.rm(temporaryPath, { force: true });
  await fs.writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, filePath);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArgs(args: string[]) {
  const result: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    }
    result[key.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value;
  }
  return result;
}

function requireOption(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseOddInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
) {
  const parsed = value === undefined ? fallback : Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum ||
    parsed % 2 === 0
  ) {
    throw new Error(`${name} must be an odd integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function parseNumber(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

if (process.argv[1]?.endsWith("build-usgs-terrain-pilot.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
