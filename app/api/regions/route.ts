import { NextResponse } from "next/server";
import {
  getActiveEnvironmentRelease,
  getUsStateCatalog,
  listUsJurisdictionCoverage,
} from "@/lib/regions/usStates";

export async function GET() {
  const catalog = getUsStateCatalog();
  const jurisdictions = listUsJurisdictionCoverage();
  const activeEnvironmentRelease = getActiveEnvironmentRelease();

  return NextResponse.json(
    {
      scope: catalog.scope,
      baselineEligibility: catalog.baselineEligibility,
      source: catalog.source,
      summary: {
        jurisdictionCount: jurisdictions.length,
        validatedMetroStateCount: jurisdictions.filter(
          (jurisdiction) => jurisdiction.validationRegions.length > 0,
        ).length,
        environmentalDataDeployedJurisdictionCount: jurisdictions.filter(
          (jurisdiction) => jurisdiction.environmentalData === "nationwide-production",
        ).length,
        fullyDeployedStateCount: jurisdictions.filter(
          (jurisdiction) => jurisdiction.environmentalData === "nationwide-production",
        ).length,
      },
      activeEnvironmentRelease,
      jurisdictions,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
