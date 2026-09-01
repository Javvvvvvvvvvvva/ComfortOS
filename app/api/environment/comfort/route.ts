import { NextResponse } from "next/server";
import { ComfortAnalysisService } from "@/lib/comfort/service";
import type { ComfortAnalysisRequest } from "@/lib/comfort/types";

const comfortService = new ComfortAnalysisService();

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ComfortAnalysisRequest;
    const comfort = await comfortService.analyzeRouteComfort(payload);

    return NextResponse.json(
      { comfort },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Comfort estimate unavailable." },
      { status: 503 },
    );
  }
}
