import { NextResponse } from "next/server";
import {
  getUsStateCatalog,
  listUsJurisdictionCoverage,
} from "@/lib/regions/usStates";

export async function GET() {
  const catalog = getUsStateCatalog();
  const jurisdictions = listUsJurisdictionCoverage();

  return NextResponse.json(
    {
      scope: catalog.scope,
      baselineEligibility: catalog.baselineEligibility,
      source: catalog.source,
      summary: {
        jurisdictionCount: jurisdictions.length,
        validatedMetroStateCount: jurisdictions.filter(
          (jurisdiction) => jurisdiction.environmentalData === "validated-metro",
        ).length,
        fullyDeployedStateCount: 0,
      },
      jurisdictions,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
