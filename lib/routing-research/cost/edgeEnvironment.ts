import { ComfortAnalysisService } from "@/lib/comfort/service";
import type { Building } from "@/lib/environment/buildings/types";
import { ShadeAnalysisService } from "@/lib/environment/shade/service";
import { WindAnalysisService } from "@/lib/environment/wind/windService";
import type { WeatherBundle } from "@/lib/weather/types";
import type { PedestrianEdge } from "@/lib/routing-research/graph/types";
import type { EdgeEnvironment } from "@/lib/routing-research/cost/types";

const TIME_BUCKET_SECONDS = 5 * 60;

export class EdgeEnvironmentCache {
  hits = 0;
  misses = 0;
  private readonly values = new Map<string, Promise<EdgeEnvironment>>();
  private readonly shadeService: ShadeAnalysisService;
  private readonly windService: WindAnalysisService;
  private readonly comfortService = new ComfortAnalysisService();

  constructor(
    private readonly buildings: Building[],
    private readonly weatherBundle: WeatherBundle,
    private readonly scenarioId: string,
  ) {
    const noOpProvider = {
      async getBuildings() {
        return buildings;
      },
    };
    this.shadeService = new ShadeAnalysisService(noOpProvider);
    this.windService = new WindAnalysisService(noOpProvider);
  }

  get size() {
    return this.values.size;
  }

  async get(edge: PedestrianEdge, departureTime: string, arrivalSeconds: number) {
    const bucket = Math.floor(arrivalSeconds / TIME_BUCKET_SECONDS);
    const timestamp = new Date(Date.parse(departureTime) + bucket * TIME_BUCKET_SECONDS * 1000).toISOString();
    const key = `${edge.id}:${this.scenarioId}:${bucket}`;
    const cached = this.values.get(key);
    if (cached) {
      this.hits += 1;
      return cached;
    }

    this.misses += 1;
    const value = evaluateEdgeEnvironment({
      edge,
      timestamp,
      buildings: this.buildings,
      weatherBundle: this.weatherBundle,
      shadeService: this.shadeService,
      windService: this.windService,
      comfortService: this.comfortService,
    });
    this.values.set(key, value);
    return value;
  }
}

async function evaluateEdgeEnvironment({
  edge,
  timestamp,
  buildings,
  weatherBundle,
  shadeService,
  windService,
  comfortService,
}: {
  edge: PedestrianEdge;
  timestamp: string;
  buildings: Building[];
  weatherBundle: WeatherBundle;
  shadeService: ShadeAnalysisService;
  windService: WindAnalysisService;
  comfortService: ComfortAnalysisService;
}): Promise<EdgeEnvironment> {
  const route = {
    id: edge.id,
    sourceRouteIndex: 0,
    geometry: edge.geometry,
    distanceMeters: edge.distanceMeters,
    durationSeconds: edge.durationSeconds,
  };
  try {
    const [shadeAnalysis, windAnalysis] = await Promise.all([
      shadeService.analyzeRouteShade({ route, departureTime: timestamp, buildings }),
      windService.analyzeRouteWind({
        route,
        departureTime: timestamp,
        buildings,
        weatherBundle,
        weatherCoordinate: weatherBundle.coordinate,
      }),
    ]);
    const comfort = await comfortService.analyzeRouteComfort({
      route,
      departureTime: timestamp,
      weatherBundle,
      shadeAnalysis,
      windAnalysis,
      profile: "cold",
    });

    return {
      edgeId: edge.id,
      timestamp,
      buildingShadeRatio: shadeAnalysis.summary.shadeRatio,
      estimatedWindExposureMps: windAnalysis.summary.averageEstimatedExposureMps,
      headwindComponentMps: windAnalysis.summary.averageHeadwindMps,
      crosswindComponentMps: windAnalysis.summary.averageCrosswindMps,
      shelterFactor: windAnalysis.segmentWind[0]?.shelterFactor ?? 0,
      environmentalExposureCost: comfort.routeComfortCost.environmentalExposureCost,
      confidence: comfort.routeComfortCost.confidence,
      comparable: comfort.routeComfortCost.comparable,
    };
  } catch {
    return {
      edgeId: edge.id,
      timestamp,
      environmentalExposureCost: conservativeMissingCost(edge),
      confidence: 0,
      comparable: false,
    };
  }
}

function conservativeMissingCost(edge: PedestrianEdge) {
  return Math.max(1, edge.durationSeconds / 60) * 12;
}
