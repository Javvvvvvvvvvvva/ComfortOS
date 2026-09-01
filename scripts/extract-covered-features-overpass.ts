import fs from "node:fs/promises";
import type { Feature, FeatureCollection, LineString } from "geojson";
import { inferCoveredFeatureSemantics } from "@/lib/environment/coveredFeatures/semantics";

type OverpassElement = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const bbox = requireOption(options.bbox, "--bbox");
  const output = requireOption(options.output, "--output");
  const endpoint = options.endpoint ?? "https://overpass-api.de/api/interpreter";
  const [west, south, east, north] = bbox.split(",").map(Number);
  if (![west, south, east, north].every(Number.isFinite)) {
    throw new Error("--bbox must be west,south,east,north.");
  }

  const query = buildCoveredFeatureQuery({ west, south, east, north });
  const startedAt = performance.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": "ComfortOS Stage 8 covered-feature audit",
    },
    body: new URLSearchParams({ data: query }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Overpass covered-feature query failed (${response.status}): ${text.slice(0, 240)}`,
    );
  }
  const payload = (await response.json()) as OverpassResponse;
  const features = (payload.elements ?? []).flatMap(normalizeOverpassCoveredWay);
  const collection: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features,
  };
  await fs.writeFile(output, `${JSON.stringify(collection, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        source: "OpenStreetMap via Overpass",
        endpoint,
        bbox: [west, south, east, north],
        coveredFeatureCount: features.length,
        querySeconds: Math.round((performance.now() - startedAt) / 100) / 10,
        output,
      },
      null,
      2,
    ),
  );
}

function buildCoveredFeatureQuery({
  west,
  south,
  east,
  north,
}: {
  west: number;
  south: number;
  east: number;
  north: number;
}) {
  const bbox = `${south},${west},${north},${east}`;
  return `
[out:json][timeout:120];
(
  way["highway"~"footway|pedestrian|path|steps|corridor|platform"]["covered"](${bbox});
  way["highway"~"footway|pedestrian|path|steps|corridor|platform"]["tunnel"~"yes|building_passage|covered"](${bbox});
  way["highway"~"footway|pedestrian|path|steps|corridor"]["indoor"="yes"](${bbox});
  way["highway"~"footway|pedestrian|path|steps"]["building_passage"="yes"](${bbox});
  way["highway"~"footway|pedestrian|path|steps"]["arcade"="yes"](${bbox});
  way["public_transport"="platform"]["covered"](${bbox});
  way["railway"="platform"]["covered"](${bbox});
);
out tags geom;
`;
}

function normalizeOverpassCoveredWay(element: OverpassElement): Feature<LineString>[] {
  if (element.type !== "way" || !element.geometry || element.geometry.length < 2) return [];
  const tags = element.tags ?? {};
  const semantics = inferCoveredFeatureSemantics(tags);
  if (!semantics.eligible) return [];
  return [
    {
      type: "Feature",
      id: `osm-way-${element.id}`,
      properties: {
        id: `osm-way-${element.id}`,
        kind: semantics.kind,
        access: semantics.access,
        accessConfidence: semantics.accessConfidence,
        source: "OpenStreetMap Overpass covered pedestrian tags",
        confidence: semantics.confidence,
        evidenceReason: semantics.reason,
        tags,
      },
      geometry: {
        type: "LineString",
        coordinates: element.geometry.map((coordinate) => [coordinate.lon, coordinate.lat]),
      },
    },
  ];
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

function requireOption(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function toCamelCase(value: string) {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
