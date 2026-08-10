import { NextResponse } from "next/server";
import { OsrmWalkingProvider } from "@/lib/routing/providers/osrmWalkingProvider";
import { RoutingService } from "@/lib/routing/service";
import type { RouteRequest } from "@/lib/routing/types";

const DEFAULT_OSRM_BASE_URL = "https://routing.openstreetmap.de/routed-foot";

export async function POST(request: Request) {
  try {
    const routeRequest = (await request.json()) as RouteRequest;
    const provider = new OsrmWalkingProvider({
      baseUrl: process.env.ROUTING_BASE_URL ?? DEFAULT_OSRM_BASE_URL,
    });
    const service = new RoutingService(provider);
    const route = await service.getFastestWalkingRoute(routeRequest);

    return NextResponse.json({ route });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to calculate a walking route.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
