export type CapabilityQuality = "unavailable" | "partial" | "ready";

export type RegionCapabilities = {
  routing: CapabilityQuality;
  weather: CapabilityQuality;
  buildings: CapabilityQuality;
  shade: CapabilityQuality;
  wind: CapabilityQuality;
  rainCover: CapabilityQuality;
  heat: CapabilityQuality;
};

export type RegionCapabilityEvidence = {
  routingReady: boolean;
  weatherAvailable: boolean;
  buildingsAvailable: boolean;
  analyzedCandidateCount: number;
  shadeAvailableCount: number;
  windAvailableCount: number;
  rainAvailableCount: number;
  rainCoverProviderAvailable: boolean;
  rainCoverConsumerEligible: boolean;
  heatAvailableCount: number;
  heatConsumerEligible: boolean;
};

export function deriveRegionCapabilities(
  evidence: RegionCapabilityEvidence,
): RegionCapabilities {
  return {
    routing: evidence.routingReady ? "ready" : "unavailable",
    weather: evidence.weatherAvailable ? "ready" : "unavailable",
    buildings: evidence.buildingsAvailable ? "ready" : "unavailable",
    shade: candidateCapability(
      evidence.shadeAvailableCount,
      evidence.analyzedCandidateCount,
    ),
    wind: candidateCapability(
      evidence.windAvailableCount,
      evidence.analyzedCandidateCount,
    ),
    rainCover: !evidence.rainCoverProviderAvailable
      ? "unavailable"
      : evidence.rainCoverConsumerEligible
        ? "ready"
        : evidence.rainAvailableCount > 0
          ? "partial"
          : "unavailable",
    heat: evidence.heatConsumerEligible
      ? "ready"
      : evidence.heatAvailableCount > 0
        ? "partial"
        : "unavailable",
  };
}

function candidateCapability(available: number, total: number): CapabilityQuality {
  if (available <= 0 || total <= 0) return "unavailable";
  return available === total ? "ready" : "partial";
}
