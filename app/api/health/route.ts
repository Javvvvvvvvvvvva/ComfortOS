import { NextResponse } from "next/server";
import { evaluateMvpReadiness } from "@/lib/health/readiness";

export async function GET() {
  const readiness = evaluateMvpReadiness();
  return NextResponse.json(readiness, {
    status: readiness.status === "ready" ? 200 : 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}
