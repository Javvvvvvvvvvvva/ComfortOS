import { NextResponse } from "next/server";
import { createConfiguredBuildingProvider } from "@/lib/environment/buildings/providers/configuredBuildingProvider";
import { ShadeAnalysisService } from "@/lib/environment/shade/service";
import type { ShadeAnalysisRequest } from "@/lib/environment/shade/types";

const { provider: buildingProvider } = createConfiguredBuildingProvider();
const shadeService = new ShadeAnalysisService(buildingProvider);

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ShadeAnalysisRequest;
    const shade = await shadeService.analyzeRouteShade(payload);

    return NextResponse.json(
      { shade },
      {
        headers: {
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Shade estimate unavailable." },
      { status: 503 },
    );
  }
}
