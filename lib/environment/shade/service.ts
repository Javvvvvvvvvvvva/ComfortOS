import { boundsCenter, boundsForLineString } from "@/lib/environment/buildings/bounds";
import type {
  BoundingBox,
  Building,
  BuildingProvider,
} from "@/lib/environment/buildings/types";
import { calculateSolarPosition } from "@/lib/environment/solar/solarPositionEngine";
import { BuildingShadowEngine } from "@/lib/environment/shade/shadowEngine";
import {
  buildingsToFeatureCollection,
  calculateSegmentShade,
  calculateUnknownHeightMeters,
  routeLengthMeters,
  segmentsToFeatureCollection,
  shadowsToFeatureCollection,
  summarizeRouteShade,
} from "@/lib/environment/shade/shadeIntersectionEngine";
import {
  assignSegmentTraversalTimes,
  segmentRouteGeometry,
} from "@/lib/environment/shade/routeSegmentation";
import type {
  BuildingShadow,
  ShadeAnalysisRequest,
  ShadeAnalysisResult,
} from "@/lib/environment/shade/types";

const BUILDING_TTL_MS = 24 * 60 * 60 * 1000;
const buildingCache = new Map<string, { expiresAt: number; value: Promise<Building[]> }>();

export class ShadeAnalysisService {
  private readonly shadowEngine = new BuildingShadowEngine();

  constructor(
    private readonly buildingProvider: BuildingProvider,
    private readonly buildingTtlMs = BUILDING_TTL_MS,
  ) {}

  async analyzeRouteShade(
    request: ShadeAnalysisRequest,
  ): Promise<ShadeAnalysisResult> {
    const departureDate = new Date(request.departureTime);
    if (Number.isNaN(departureDate.valueOf())) throw new Error("Invalid shade timestamp.");

    const routeGeometry = request.route.geometry;
    const bounds = boundsForLineString(routeGeometry);
    const projectionOrigin = boundsCenter(bounds);
    const solarPosition = calculateSolarPosition({
      latitude: projectionOrigin.latitude,
      longitude: projectionOrigin.longitude,
      timestamp: departureDate.toISOString(),
    });
    const buildings = request.buildings ?? (await this.getBuildings(bounds));
    const segments = assignSegmentTraversalTimes({
      segments: segmentRouteGeometry(routeGeometry),
      departureTime: departureDate.toISOString(),
      routeDurationSeconds: request.route.durationSeconds,
    });
    const routeMeters = routeLengthMeters({
      type: "LineString",
      coordinates: routeGeometry.coordinates,
    });

    if (!solarPosition.sunAboveHorizon) {
      const segmentShade = segments.map((segment) => ({
        segmentId: segment.id,
        shadeRatio: 0,
        shadedMeters: 0,
        exposedMeters: segment.distanceMeters,
        totalMeters: segment.distanceMeters,
        confidence: 1,
        estimatedEntryTime: segment.estimatedEntryTime,
        estimatedExitTime: segment.estimatedExitTime,
        estimatedMidpointTime: segment.estimatedMidpointTime,
        solarAzimuthDeg: solarPosition.azimuthDeg,
        solarElevationDeg: solarPosition.elevationDeg,
      }));
      const { summary, coverage, quality } = summarizeRouteShade({
        segmentShade,
        routeMeters,
        buildings,
        unknownMeters: 0,
      });

      const debug = request.includeDebug === false
        ? undefined
        : {
            buildings: buildingsToFeatureCollection(buildings),
            shadows: shadowsToFeatureCollection([]),
            segments: segmentsToFeatureCollection(segments, segmentShade),
          };

      return {
        status: "night",
        routeGeometry,
        departureTime: departureDate.toISOString(),
        solarPosition,
        segments,
        segmentShade,
        summary: { ...summary, confidence: 1 },
        coverage,
        quality: { ...quality, routeAnalysisCoverage: 1, overallConfidence: 1 },
        ...(debug ? { debug } : {}),
      };
    }

    const allShadows: BuildingShadow[] | null = request.includeDebug === false ? null : [];
    const segmentShade = segments.flatMap((segment) => {
      const segmentSolarPosition = calculateSolarPosition({
        latitude: projectionOrigin.latitude,
        longitude: projectionOrigin.longitude,
        timestamp: segment.estimatedMidpointTime,
      });
      const shadowResult = this.shadowEngine.calculateBuildingShadows(
        buildings,
        segmentSolarPosition,
        projectionOrigin,
      );
      allShadows?.push(...shadowResult.shadows);
      const [shade] = calculateSegmentShade(
        [segment],
        shadowResult.shadows,
        projectionOrigin,
      );

      return [
        {
          ...shade,
          solarAzimuthDeg: segmentSolarPosition.azimuthDeg,
          solarElevationDeg: segmentSolarPosition.elevationDeg,
        },
      ];
    });
    const unknownMeters = calculateUnknownHeightMeters({
      segments,
      buildings,
      projectionOrigin,
    });
    const { summary, coverage, quality } = summarizeRouteShade({
      segmentShade,
      routeMeters,
      buildings,
      unknownMeters,
    });

    const debug = allShadows
      ? {
          buildings: buildingsToFeatureCollection(buildings),
          shadows: shadowsToFeatureCollection(uniqueBuildingShadows(allShadows)),
          segments: segmentsToFeatureCollection(segments, segmentShade),
          sourceComparison: {
            defaultProvider: "OpenStreetMap via Overpass",
            alternateProvider: "Overture Maps Buildings",
            note:
              "Overture remains behind the provider boundary; Stage 2.5 benchmark documentation records current feasibility and production recommendation.",
          },
        }
      : undefined;

    return {
      status: "available",
      routeGeometry,
      departureTime: departureDate.toISOString(),
      solarPosition,
      segments,
      segmentShade,
      summary,
      coverage,
      quality,
      ...(debug ? { debug } : {}),
    };
  }

  private async getBuildings(bounds: BoundingBox) {
    const key = `${bounds.west.toFixed(4)},${bounds.south.toFixed(4)},${bounds.east.toFixed(4)},${bounds.north.toFixed(4)}`;
    const cached = buildingCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const value = this.buildingProvider.getBuildings(bounds);
    buildingCache.set(key, {
      expiresAt: Date.now() + this.buildingTtlMs,
      value,
    });

    try {
      return await value;
    } catch (error) {
      buildingCache.delete(key);
      throw error;
    }
  }
}

function uniqueBuildingShadows(shadows: BuildingShadow[]) {
  const seen = new Set<string>();
  return shadows.filter((shadow) => {
    const key = `${shadow.buildingId}:${shadow.sourceHeightMeters}:${JSON.stringify(shadow.geometry.coordinates)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
