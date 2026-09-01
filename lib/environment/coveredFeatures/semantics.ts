import type {
  CoveredFeature,
  CoveredFeatureAccess,
  CoveredFeatureKind,
} from "@/lib/environment/coveredFeatures/types";

export type CoveredFeatureSemantics = {
  eligible: boolean;
  kind: CoveredFeatureKind;
  confidence: number;
  access: CoveredFeatureAccess;
  accessConfidence: number;
  reason: string;
};

const WALKABLE_HIGHWAYS = new Set([
  "footway",
  "pedestrian",
  "path",
  "steps",
  "corridor",
  "platform",
]);

const RESTRICTED_VALUES = new Set(["no", "private", "destination", "delivery", "agricultural", "forestry"]);
const PUBLIC_VALUES = new Set(["yes", "designated", "official", "public"]);
const PERMISSIVE_VALUES = new Set(["permissive"]);
const CUSTOMER_VALUES = new Set(["customers", "customer"]);

export function inferCoveredFeatureSemantics(
  tags: Record<string, string> = {},
): CoveredFeatureSemantics {
  const highway = tags.highway;
  const isWalkableHighway = typeof highway === "string" && WALKABLE_HIGHWAYS.has(highway);
  const isTransitWalkable =
    tags.public_transport === "platform" ||
    tags.railway === "platform" ||
    tags.railway === "station" ||
    tags.amenity === "bus_station";
  const access = inferAccess(tags);

  if (access.access === "restricted") {
    return {
      eligible: false,
      kind: "roofed-walkway",
      confidence: 0,
      ...access,
      reason: "Restricted pedestrian access.",
    };
  }

  const coveredValue = normalized(tags.covered);
  const tunnelValue = normalized(tags.tunnel);
  const indoorValue = normalized(tags.indoor);

  if (tunnelValue === "building_passage" || tags.building_passage === "yes") {
    return buildSemantics({
      eligible: isWalkableHighway || isTransitWalkable,
      kind: "building-passage",
      confidence: 0.86,
      access,
      reason: "OSM building passage implies cover but remains distinct from indoor routing.",
    });
  }

  if (coveredValue === "arcade" || coveredValue === "colonnade" || tags.arcade === "yes") {
    return buildSemantics({
      eligible: isWalkableHighway || isTransitWalkable,
      kind: "arcade",
      confidence: 0.84,
      access,
      reason: "OSM arcade/colonnade cover on a walkable feature.",
    });
  }

  if (isTransitWalkable && (coveredValue === "yes" || tags.shelter === "yes" || tags.cover === "yes")) {
    return buildSemantics({
      eligible: true,
      kind: "transit-covered-walkway",
      confidence: 0.78,
      access,
      reason: "Transit pedestrian feature with explicit cover or shelter tag.",
    });
  }

  if (coveredValue === "yes" && (isWalkableHighway || isTransitWalkable)) {
    return buildSemantics({
      eligible: true,
      kind: "roofed-walkway",
      confidence: 0.8,
      access,
      reason: "Explicit covered=yes on a pedestrian-routable feature.",
    });
  }

  if ((tunnelValue === "yes" || tunnelValue === "covered") && (isWalkableHighway || isTransitWalkable)) {
    return buildSemantics({
      eligible: true,
      kind: "tunnel",
      confidence: 0.72,
      access,
      reason: "Pedestrian tunnel is treated as covered with moderate confidence.",
    });
  }

  if (indoorValue === "yes" && (isWalkableHighway || highway === "corridor")) {
    return buildSemantics({
      eligible: access.access !== "unknown",
      kind: "indoor-public-connector",
      confidence: 0.64,
      access,
      reason: "Indoor pedestrian connector is only eligible when public/permissive access is explicit.",
    });
  }

  return {
    eligible: false,
    kind: "roofed-walkway",
    confidence: 0,
    ...access,
    reason: "No defensible pedestrian cover semantics.",
  };
}

export function isRainCoverEligible(feature: CoveredFeature) {
  return feature.access !== "restricted" && feature.confidence > 0 && feature.accessConfidence > 0;
}

export function normalizeCoveredFeatureKind(value: string | undefined): CoveredFeatureKind {
  if (
    value === "roofed-walkway" ||
    value === "arcade" ||
    value === "building-passage" ||
    value === "tunnel" ||
    value === "indoor-public-connector" ||
    value === "transit-covered-walkway"
  ) {
    return value;
  }
  if (value === "covered-walkway") return "roofed-walkway";
  if (value === "indoor-connector") return "indoor-public-connector";
  if (value === "transit-shelter") return "transit-covered-walkway";
  return "roofed-walkway";
}

export function inferAccess(tags: Record<string, string>): {
  access: CoveredFeatureAccess;
  accessConfidence: number;
} {
  const values = [tags.foot, tags.access, tags.indoor_access].map(normalized).filter(Boolean);
  if (values.some((value) => RESTRICTED_VALUES.has(value))) {
    return { access: "restricted", accessConfidence: 0 };
  }
  if (values.some((value) => PUBLIC_VALUES.has(value))) {
    return { access: "public", accessConfidence: 0.9 };
  }
  if (values.some((value) => PERMISSIVE_VALUES.has(value))) {
    return { access: "permissive", accessConfidence: 0.78 };
  }
  if (values.some((value) => CUSTOMER_VALUES.has(value))) {
    return { access: "customers", accessConfidence: 0.45 };
  }
  return { access: "unknown", accessConfidence: 0.58 };
}

function buildSemantics({
  eligible,
  kind,
  confidence,
  access,
  reason,
}: {
  eligible: boolean;
  kind: CoveredFeatureKind;
  confidence: number;
  access: ReturnType<typeof inferAccess>;
  reason: string;
}): CoveredFeatureSemantics {
  return {
    eligible,
    kind,
    confidence: eligible ? confidence : 0,
    access: access.access,
    accessConfidence: eligible ? access.accessConfidence : 0,
    reason,
  };
}

function normalized(value: string | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
