import { NextResponse } from "next/server";
import { OverpassBuildingProvider } from "@/lib/environment/buildings/providers/overpassBuildingProvider";
import { ShadeAnalysisService } from "@/lib/environment/shade/service";
import type { ShadeAnalysisRequest } from "@/lib/environment/shade/types";

const buildingProvider = new OverpassBuildingProvider({
  baseUrl: process.env.BUILDING_OVERPASS_BASE_URL,
});
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
