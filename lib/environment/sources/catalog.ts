export const ENVIRONMENT_LAYER_IDS = [
  "terrain-elevation",
  "land-cover",
  "impervious-surface",
  "tree-canopy",
  "landform",
  "pedestrian-surface",
] as const;

export type EnvironmentLayerId = (typeof ENVIRONMENT_LAYER_IDS)[number];

export type EnvironmentSourceActivation =
  | "pilot"
  | "candidate"
  | "fallback-only"
  | "coverage-gap";

export type EnvironmentSourceCatalogEntry = {
  id: string;
  layer: EnvironmentLayerId;
  authority: string;
  dataset: string;
  version: string;
  dataAsOf: string;
  coverage: string[];
  spatialResolutionMeters?: {
    nominal: number;
    available?: number[];
  };
  updateCadence: "continuous" | "monthly" | "annual" | "irregular";
  freshnessPolicyDays: number;
  license: {
    name: string;
    url: string;
  };
  access: {
    method:
      | "arcgis-image-service"
      | "official-download"
      | "ogc-wms"
      | "cloud-geoparquet";
    url: string;
    dataUri?: string;
  };
  activation: EnvironmentSourceActivation;
  qualitySignals: string[];
  intendedUses: string[];
  prohibitedClaims: string[];
};

export type EnvironmentSourceCatalog = {
  format: "comfortos-environment-source-catalog-v1";
  updatedAt: string;
  sources: EnvironmentSourceCatalogEntry[];
};

export function parseEnvironmentSourceCatalog(
  value: unknown,
): EnvironmentSourceCatalog {
  const catalog = asRecord(value, "environment source catalog");
  if (
    catalog.format !== "comfortos-environment-source-catalog-v1" ||
    !isTimestamp(catalog.updatedAt) ||
    !Array.isArray(catalog.sources) ||
    catalog.sources.length === 0
  ) {
    throw new Error("Invalid environment source catalog.");
  }

  const sources = catalog.sources.map(parseSource);
  const ids = new Set<string>();
  for (const source of sources) {
    if (ids.has(source.id)) {
      throw new Error(`Duplicate environment source id: ${source.id}`);
    }
    ids.add(source.id);
    if (Date.parse(`${source.dataAsOf}T00:00:00.000Z`) > Date.parse(catalog.updatedAt)) {
      throw new Error(`Environment source is dated after the catalog: ${source.id}`);
    }
  }

  return {
    format: catalog.format,
    updatedAt: catalog.updatedAt,
    sources,
  };
}

function parseSource(value: unknown): EnvironmentSourceCatalogEntry {
  const source = asRecord(value, "environment source");
  const license = asRecord(source.license, "environment source license");
  const access = asRecord(source.access, "environment source access");
  const resolution = source.spatialResolutionMeters === undefined
    ? undefined
    : asRecord(source.spatialResolutionMeters, "environment source resolution");

  if (
    !isSafeId(source.id) ||
    !ENVIRONMENT_LAYER_IDS.includes(source.layer as EnvironmentLayerId) ||
    !isNonEmptyString(source.authority) ||
    !isNonEmptyString(source.dataset) ||
    !isPinnedVersion(source.version) ||
    !isDate(source.dataAsOf) ||
    !isStringList(source.coverage) ||
    !["continuous", "monthly", "annual", "irregular"].includes(
      source.updateCadence as string,
    ) ||
    !isPositiveInteger(source.freshnessPolicyDays) ||
    !isNonEmptyString(license.name) ||
    !isHttpsUrl(license.url) ||
    ![
      "arcgis-image-service",
      "official-download",
      "ogc-wms",
      "cloud-geoparquet",
    ].includes(access.method as string) ||
    !isHttpsUrl(access.url) ||
    (access.dataUri !== undefined && !isDataUri(access.dataUri)) ||
    !["pilot", "candidate", "fallback-only", "coverage-gap"].includes(
      source.activation as string,
    ) ||
    !isStringList(source.qualitySignals) ||
    !isStringList(source.intendedUses) ||
    !isStringList(source.prohibitedClaims)
  ) {
    throw new Error("Invalid environment source entry.");
  }

  if (
    resolution &&
    (!isPositiveNumber(resolution.nominal) ||
      (resolution.available !== undefined &&
        (!Array.isArray(resolution.available) ||
          resolution.available.length === 0 ||
          !resolution.available.every(isPositiveNumber))))
  ) {
    throw new Error(`Invalid environment source resolution: ${source.id}`);
  }

  return {
    id: source.id,
    layer: source.layer as EnvironmentLayerId,
    authority: source.authority,
    dataset: source.dataset,
    version: source.version,
    dataAsOf: source.dataAsOf,
    coverage: [...source.coverage],
    spatialResolutionMeters: resolution
      ? {
          nominal: resolution.nominal as number,
          available: resolution.available as number[] | undefined,
        }
      : undefined,
    updateCadence: source.updateCadence as EnvironmentSourceCatalogEntry["updateCadence"],
    freshnessPolicyDays: source.freshnessPolicyDays,
    license: {
      name: license.name,
      url: license.url,
    },
    access: {
      method: access.method as EnvironmentSourceCatalogEntry["access"]["method"],
      url: access.url,
      dataUri: access.dataUri as string | undefined,
    },
    activation: source.activation as EnvironmentSourceActivation,
    qualitySignals: [...source.qualitySignals],
    intendedUses: [...source.intendedUses],
    prohibitedClaims: [...source.prohibitedClaims],
  } as EnvironmentSourceCatalogEntry;
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${name}.`);
  }
  return value as Record<string, unknown>;
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]*$/.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPinnedVersion(value: unknown): value is string {
  return isNonEmptyString(value) && value.toLowerCase() !== "latest";
}

function isDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
  );
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isDataUri(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value.startsWith("https://") || value.startsWith("s3://")) &&
    !value.includes("..")
  );
}
