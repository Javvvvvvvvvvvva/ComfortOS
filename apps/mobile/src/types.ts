export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type Place = {
  id: string;
  name: string;
  address?: string;
  coordinate: Coordinate;
  category?: string;
};

export type PlaceSuggestion = Omit<Place, "coordinate"> & {
  coordinate?: Coordinate;
};

export type LineStringGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

export type RouteRequest = {
  origin: Coordinate;
  destination: Coordinate;
  departureTime: string;
};

export type RouteResult = {
  geometry: LineStringGeometry;
  distanceMeters: number;
  durationSeconds: number;
  provider?: { id: string; dataVersion?: string };
};

export type RouteContext = "cold" | "balanced" | "rain" | "snow" | "heat";
export type CapabilityQuality = "unavailable" | "partial" | "ready";

export type RouteCandidate = {
  id: string;
  role: "fastest" | "comfort" | "fastest-and-comfort" | "alternative";
  status: "complete" | "partial" | "failed";
  route: RouteResult;
  metrics: {
    extraDurationSeconds: number;
    environmentalCostReductionRatio: number;
  };
  comfortAnalysis?: {
    profile: RouteContext;
    summary: {
      comfortScore: number | null;
      dominantFactors: Array<{ type: string; contribution: number }>;
    };
    routeComfortCost: {
      confidence: number;
      completeness: number;
      comparable: boolean;
    };
  } | null;
  shadeAnalysis?: { summary: { shadeRatio: number } } | null;
  windAnalysis?: {
    summary: { averageEstimatedExposureMps: number; averageHeadwindMps: number };
  } | null;
  rainAnalysis?: {
    summary: { averageRainExposure: number; coveredMeters: number };
  } | null;
  heatAnalysis?: { summary: { directSunRatio: number; averageHeatExposure: number } } | null;
  snowAnalysis?: {
    summary: { averageSnowfallExposure: number; averageIceExposure: number };
  } | null;
};

export type ComfortComparison = {
  fastest: RouteCandidate;
  comfort: RouteCandidate;
  candidates: RouteCandidate[];
  debug: {
    capabilities?: {
      routing: CapabilityQuality;
      weather: CapabilityQuality;
      buildings: CapabilityQuality;
      shade: CapabilityQuality;
      wind: CapabilityQuality;
      rainCover: CapabilityQuality;
      snow: CapabilityQuality;
      heat: CapabilityQuality;
    };
    context?: {
      context: RouteContext;
      routeLabel: string;
      reason: string;
    };
  };
};

export type WeatherSnapshot = {
  timestamp: string;
  temperatureC?: number | null;
  heatIndexC?: number | null;
  windChillC?: number | null;
  relativeHumidity?: number | null;
  windSpeedMps?: number | null;
  condition?: string | null;
};

export type WeatherBundle = {
  current: WeatherSnapshot | null;
  hourlyForecast: WeatherSnapshot[];
  alerts: Array<{
    id: string;
    event: string;
    headline: string;
    severity: string;
  }>;
  updatedAt: string;
};
