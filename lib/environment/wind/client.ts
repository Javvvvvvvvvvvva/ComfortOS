import type { WindAnalysisRequest, WindAnalysisResult } from "@/lib/environment/wind/types";

export async function requestWindAnalysis(
  request: WindAnalysisRequest,
  signal?: AbortSignal,
): Promise<WindAnalysisResult> {
  const response = await fetch("/api/environment/wind", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
    cache: "no-store",
  });

  if (!response.ok) throw new Error("Wind estimate unavailable.");

  const payload = (await response.json()) as { wind?: WindAnalysisResult };
  if (!payload.wind) throw new Error("Wind estimate unavailable.");
  return payload.wind;
}
