import catalogData from "@/config/data-regions/us-states.json";

export type UsBaselineEligibility = {
  placeSearch: boolean;
  walkingRouting: boolean;
  nwsWeather: boolean;
};

export type UsValidationProfile = "cold" | "wind" | "shade" | "rain" | "heat";

export type UsValidationRegion = {
  id: string;
  label: string;
  profiles: UsValidationProfile[];
};

export type UsJurisdiction = {
  fips: string;
  code: string;
  name: string;
  bbox: [number, number, number, number];
  landAreaSquareMeters: number;
  waterAreaSquareMeters: number;
  validationRegions: UsValidationRegion[];
};

export type UsJurisdictionCoverage = UsJurisdiction & {
  baselineEligibility: UsBaselineEligibility;
  environmentalData: "validated-metro" | "not-deployed";
};

type UsStateCatalogFile = {
  schemaVersion: number;
  scope: string;
  baselineEligibility: UsBaselineEligibility;
  source: {
    publisher: string;
    dataset: string;
    url: string;
    retrievedAt: string;
  };
  jurisdictions: UsJurisdiction[];
};

const catalog = validateCatalog(catalogData as UsStateCatalogFile);

export function getUsStateCatalog() {
  return catalog;
}

export function listUsJurisdictionCoverage(): UsJurisdictionCoverage[] {
  return catalog.jurisdictions.map((jurisdiction) => ({
    ...jurisdiction,
    baselineEligibility: catalog.baselineEligibility,
    environmentalData:
      jurisdiction.validationRegions.length > 0 ? "validated-metro" : "not-deployed",
  }));
}

export function findUsJurisdiction(codeOrFips: string) {
  const normalized = codeOrFips.trim().toUpperCase();
  return catalog.jurisdictions.find(
    (jurisdiction) =>
      jurisdiction.code === normalized || jurisdiction.fips === normalized,
  ) ?? null;
}

function validateCatalog(value: UsStateCatalogFile) {
  if (value.schemaVersion !== 1 || value.jurisdictions.length !== 51) {
    throw new Error("Invalid United States jurisdiction catalog.");
  }

  const codes = new Set<string>();
  const fipsCodes = new Set<string>();
  for (const jurisdiction of value.jurisdictions) {
    if (
      !/^[A-Z]{2}$/.test(jurisdiction.code) ||
      !/^\d{2}$/.test(jurisdiction.fips) ||
      codes.has(jurisdiction.code) ||
      fipsCodes.has(jurisdiction.fips) ||
      jurisdiction.bbox.length !== 4 ||
      !jurisdiction.bbox.every(Number.isFinite)
    ) {
      throw new Error("Invalid United States jurisdiction catalog entry.");
    }
    codes.add(jurisdiction.code);
    fipsCodes.add(jurisdiction.fips);
  }

  return value;
}
