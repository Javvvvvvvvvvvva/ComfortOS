import type {
  CapabilityQuality,
  ComfortComparison,
  RouteCandidate,
  RouteContext,
  WeatherBundle,
} from "../types";

const METERS_PER_MILE = 1609.344;

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "Unavailable";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

export function formatDistance(meters: number) {
  if (!Number.isFinite(meters) || meters < 0) return "Unavailable";
  if (meters < 160) return `${Math.round(meters)} m`;
  const miles = meters / METERS_PER_MILE;
  return `${miles.toFixed(miles >= 10 ? 0 : 1)} mi`;
}

export function formatPercent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : "Unavailable";
}

export function candidateLabel(context: RouteContext) {
  switch (context) {
    case "cold":
      return "Stay Warm";
    case "rain":
      return "Stay Dry";
    case "snow":
      return "Snow Comfort";
    case "heat":
      return "Stay Cool";
    default:
      return "Comfiest";
  }
}

export function routeExplanation(
  candidate: RouteCandidate,
  comparison: ComfortComparison,
) {
  if (candidate.status !== "complete") return "Limited environmental data.";
  if (candidate.role === "fastest") return "Standard walking route for the time comparison.";
  if (candidate.role === "fastest-and-comfort") {
    return "Fastest is also the most comfortable option we found.";
  }

  const reduction = candidate.metrics.environmentalCostReductionRatio;
  if (reduction >= 0.08) {
    return `${Math.round(reduction * 100)}% lower environmental exposure`;
  }

  const context = comparison.debug.context?.context ?? "balanced";
  if (context === "rain" && comparison.debug.capabilities?.rainCover !== "unavailable") {
    const covered = candidate.rainAnalysis?.summary.coveredMeters;
    if (typeof covered === "number" && covered >= 20) {
      return `${formatDistance(covered)} with estimated overhead cover`;
    }
  }
  if (context === "heat") {
    const directSun = candidate.heatAnalysis?.summary.directSunRatio;
    if (typeof directSun === "number") return `${formatPercent(directSun)} in direct sun`;
  }
  if (context === "snow") return "Lower estimated winter exposure";
  if (context === "cold") return "Lower estimated cold and wind exposure";
  return "Lower estimated environmental exposure";
}

export function formatCoveredDistance(
  candidate: RouteCandidate,
  quality: CapabilityQuality | undefined,
) {
  if (quality === "unavailable" || !quality) return "Unavailable";
  const covered = candidate.rainAnalysis?.summary.coveredMeters;
  if (typeof covered !== "number") return "Unavailable";
  const formatted = formatDistance(covered);
  return quality === "partial" ? `${formatted} (limited)` : formatted;
}

export function weatherSummary(weather: WeatherBundle | null) {
  const snapshot = weather?.current ?? weather?.hourlyForecast[0] ?? null;
  if (!snapshot) return { primary: "Choose a start", secondary: "Live weather appears here" };
  const temperature =
    typeof snapshot.temperatureC === "number" ? `${Math.round(snapshot.temperatureC)} C` : "Live";
  const condition = snapshot.condition?.trim() || "conditions";
  const humidity =
    typeof snapshot.relativeHumidity === "number"
      ? `${Math.round(snapshot.relativeHumidity)}% humidity`
      : "Current weather";
  return { primary: `${temperature} | ${condition}`, secondary: humidity };
}
