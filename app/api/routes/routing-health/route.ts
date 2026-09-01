import { NextResponse } from "next/server";
import { createConfiguredRoutingProvider } from "@/lib/routing/providers/configuredRoutingProvider";
import { RoutingService } from "@/lib/routing/service";

export async function GET(request: Request) {
  try {
    const { provider, metadata, mode } = createConfiguredRoutingProvider();
    const service = new RoutingService(provider);
    const health = await service.checkProviderHealth({ signal: request.signal });

    return NextResponse.json(
      {
        mode,
        provider: metadata,
        healthy: health?.ok ?? false,
        latencyMs: health?.latencyMs ?? 0,
        health: health ?? {
          ok: false,
          status: "unavailable",
          latencyMs: 0,
          provider: metadata,
          message: "Routing provider does not expose a health check.",
        },
      },
      { status: health?.ok ? 200 : 503 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        healthy: false,
        error:
          error instanceof Error ? error.message : "Routing provider is not configured.",
      },
      { status: 503 },
    );
  }
}
