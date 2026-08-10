import type {
  ComfortAnalysisRequest,
  ComfortAnalysisResult,
} from "@/lib/comfort/types";

export async function requestComfortAnalysis(
  request: ComfortAnalysisRequest,
  signal?: AbortSignal,
): Promise<ComfortAnalysisResult> {
  const response = await fetch("/api/environment/comfort", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const payload = (await response.json()) as {
    comfort?: ComfortAnalysisResult;
    error?: string;
  };

  if (!response.ok || !payload.comfort) {
    throw new Error(payload.error ?? "Comfort estimate unavailable.");
  }

  return payload.comfort;
}
