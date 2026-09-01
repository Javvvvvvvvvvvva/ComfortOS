import type {
  ShadeAnalysisRequest,
  ShadeAnalysisResult,
} from "@/lib/environment/shade/types";

export async function requestShadeAnalysis(
  request: ShadeAnalysisRequest,
  signal?: AbortSignal,
): Promise<ShadeAnalysisResult> {
  const response = await fetch("/api/environment/shade", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    shade?: ShadeAnalysisResult;
    error?: string;
  };

  if (!response.ok || !payload.shade) {
    throw new Error(payload.error ?? "Shade estimate unavailable.");
  }

  return payload.shade;
}
