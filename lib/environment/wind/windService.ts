import { feature, featureCollection } from "@turf/turf";
import type { FeatureCollection, LineString, MultiPolygon, Polygon } from "geojson";
import { boundsCenter, boundsForLineString } from "@/lib/environment/buildings/bounds";
import type {
  BoundingBox,
  Building,
  BuildingProvider,
} from "@/lib/environment/buildings/types";
import {
  assignSegmentTraversalTimes,
  segmentRouteGeometry,
} from "@/lib/environment/shade/routeSegmentation";
import { createLocalProjection } from "@/lib/environment/shade/projection";
import { routeLengthMeters } from "@/lib/environment/shade/shadeIntersectionEngine";
import type { TimedRouteSegment } from "@/lib/environment/shade/types";
import type {
  RouteWindSummary,
  SegmentWind,
  UrbanWindModel,
  WindAnalysisRequest,
  WindAnalysisResult,
  WindCoverage,
  WindQuality,
} from "@/lib/environment/wind/types";
import {
  HeuristicUrbanWindModel,
  WIND_MODEL_CONFIG,
  calculateUnknownHeightInfluenceFromPreparedContext,
  prepareWindBuildingContext,
} from "@/lib/environment/wind/urbanWindModel";
import { bearingVector, selectWindStateForTime } from "@/lib/environment/wind/windVector";
import type { Coordinate } from "@/lib/geo/types";
import type { WeatherService } from "@/lib/weather/service";
import type { WeatherBundle } from "@/lib/weather/types";

const BUILDING_TTL_MS = 24 * 60 * 60 * 1000;
const buildingCache = new Map<string, { expiresAt: number; value: Promise<Building[]> }>();

export class WindAnalysisService {
  constructor(
    private readonly buildingProvider: BuildingProvider,
    private readonly weatherService?: WeatherService,
    private readonly urbanWindModel: UrbanWindModel = new HeuristicUrbanWindModel(),
    private readonly buildingTtlMs = BUILDING_TTL_MS,
  ) {}

  async analyzeRouteWind(request: WindAnalysisRequest): Promise<WindAnalysisResult> {
    const departureDate = new Date(request.departureTime);
    if (Number.isNaN(departureDate.valueOf())) throw new Error("Invalid wind timestamp.");

    const routeGeometry = request.route.geometry;
    const bounds = boundsForLineString(routeGeometry);
    const projectionOrigin = boundsCenter(bounds);
    const weatherCoordinate = request.weatherCoordinate ?? projectionOrigin;
    const [buildings, weatherBundle] = await Promise.all([
      request.buildings ?? this.getBuildings(bounds),
      this.getWeatherBundle(weatherCoordinate, request.weatherBundle),
    ]);
    const segments = assignSegmentTraversalTimes({
      segments: segmentRouteGeometry(routeGeometry),
      departureTime: departureDate.toISOString(),
      routeDurationSeconds: request.route.durationSeconds,
    });
    const routeMeters = routeLengthMeters({
      type: "LineString",
      coordinates: routeGeometry.coordinates,
    });
    const preparedBuildingContext = prepareWindBuildingContext(buildings, projectionOrigin);

    const segmentWind = segments.map((segment) => {
      const windState = selectWindStateForTime(weatherBundle, segment.estimatedMidpointTime);
      if (!windState) throw new Error("Wind data unavailable.");

      const estimated = this.urbanWindModel.estimateSegmentWind(segment, windState, {
        buildings,
        projectionOrigin,
        preparedBuildingContext,
      });
      const unknownMeters = calculateUnknownHeightInfluenceFromPreparedContext(
        segment,
        preparedBuildingContext,
      );

      return {
        ...estimated,
        unknownMeters,
        classification: classifySegmentWind(estimated, segment.distanceMeters, unknownMeters),
      };
    });
    const unknownMeters = segmentWind.reduce((sum, segment) => sum + segment.unknownMeters, 0);
    const { summary, coverage, quality } = summarizeRouteWind({
      segmentWind,
      segments,
      routeMeters,
      buildings,
      unknownMeters,
    });

    const debug = request.includeDebug === false
      ? undefined
      : {
          buildings: buildingsToFeatureCollection(buildings),
          segments: windSegmentsToFeatureCollection(segments, segmentWind),
          windVectors: windVectorsToFeatureCollection(segments, segmentWind, projectionOrigin),
          note:
            "Wind direction is meteorological FROM direction. Exposure is a deterministic heuristic estimate, not measured street wind.",
        };

    return {
      status: "available",
      routeGeometry,
      departureTime: departureDate.toISOString(),
      segments,
      segmentWind,
      summary,
      coverage,
      quality,
      ...(debug ? { debug } : {}),
    };
  }

  private async getWeatherBundle(coordinate: Coordinate, provided?: WeatherBundle) {
    if (provided) return provided;
    if (!this.weatherService) throw new Error("Wind data unavailable.");
    return this.weatherService.getWeatherBundle(coordinate);
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

export function summarizeRouteWind({
  segmentWind,
  segments,
  routeMeters,
  buildings,
  unknownMeters,
}: {
  segmentWind: SegmentWind[];
  segments: TimedRouteSegment[];
  routeMeters: number;
  buildings: Building[];
  unknownMeters: number;
}): { summary: RouteWindSummary; coverage: WindCoverage; quality: WindQuality } {
  const distanceWeighted = (selector: (segment: SegmentWind) => number) =>
    segmentWind.reduce((sum, segment) => {
      const routeSegment = segments.find((item) => item.id === segment.segmentId);
      return sum + selector(segment) * (routeSegment?.distanceMeters ?? 0);
    }, 0) / Math.max(1, routeMeters);
  const knownSegmentMeters = (segment: SegmentWind, routeSegment?: TimedRouteSegment) =>
    Math.max(0, (routeSegment?.distanceMeters ?? 0) - segment.unknownMeters);
  const shelteredMeters = segmentWind.reduce((sum, segment) => {
    const routeSegment = segments.find((item) => item.id === segment.segmentId);
    return (
      sum +
      (segment.classification === "sheltered" ? knownSegmentMeters(segment, routeSegment) : 0)
    );
  }, 0);
  const neutralMeters = segmentWind.reduce((sum, segment) => {
    const routeSegment = segments.find((item) => item.id === segment.segmentId);
    return (
      sum +
      (segment.classification === "neutral" ? knownSegmentMeters(segment, routeSegment) : 0)
    );
  }, 0);
  const exposedMeters = segmentWind.reduce((sum, segment) => {
    const routeSegment = segments.find((item) => item.id === segment.segmentId);
    return (
      sum +
      (segment.classification === "exposed" ? knownSegmentMeters(segment, routeSegment) : 0)
    );
  }, 0);
  const boundedUnknownMeters = Math.min(routeMeters, Math.max(0, unknownMeters));
  const analyzedMeters = Math.max(0, routeMeters - boundedUnknownMeters);
  const explicitHeightBuildingCount = buildings.filter(
    (building) => building.heightSource === "provider" || building.heightSource === "measured",
  ).length;
  const floorDerivedHeightBuildingCount = buildings.filter(
    (building) => building.heightSource === "floors-derived",
  ).length;
  const unknownHeightBuildingCount = buildings.filter((building) => !building.heightMeters).length;
  const usableBuildingCount = buildings.length - unknownHeightBuildingCount;
  const weatherConfidence = segmentWind.length
    ? distanceWeighted((segment) => segment.windDataConfidence)
    : 0;
  const heightCoverage =
    buildings.length > 0
      ? (explicitHeightBuildingCount + floorDerivedHeightBuildingCount * WIND_MODEL_CONFIG.floorDerivedHeightWeight) /
        buildings.length
      : 1;
  const routeAnalysisCoverage =
    routeMeters > 0 ? (routeMeters - boundedUnknownMeters) / routeMeters : 0;
  const quality: WindQuality = {
    weatherConfidence: clamp01(weatherConfidence),
    geometryCoverage: routeMeters > 0 ? 1 : 0,
    heightCoverage: clamp01(heightCoverage),
    shelterModelConfidence: WIND_MODEL_CONFIG.shelterModelBaseConfidence,
    routeAnalysisCoverage: clamp01(routeAnalysisCoverage),
    overallConfidence: clamp01(
      (routeMeters > 0 ? 1 : 0) *
        routeAnalysisCoverage *
        (weatherConfidence * 0.4 +
          heightCoverage * 0.25 +
          WIND_MODEL_CONFIG.shelterModelBaseConfidence * 0.25 +
          0.1),
    ),
  };

  return {
    summary: {
      averageEstimatedExposureMps: distanceWeighted((segment) => segment.estimatedExposureMps),
      averageHeadwindMps: distanceWeighted((segment) => segment.headwindComponentMps),
      averageCrosswindMps: distanceWeighted((segment) => segment.crosswindComponentMps),
      shelteredMeters,
      neutralMeters,
      exposedMeters,
      analyzedMeters,
      unknownMeters: boundedUnknownMeters,
      confidence: quality.overallConfidence,
    },
    coverage: {
      routeMeters,
      analyzedMeters,
      unknownMeters: boundedUnknownMeters,
      shelteredMeters,
      neutralMeters,
      exposedMeters,
      buildingCount: buildings.length,
      usableBuildingCount,
      explicitHeightBuildingCount,
      floorDerivedHeightBuildingCount,
      unknownHeightBuildingCount,
    },
    quality,
  };
}

function windSegmentsToFeatureCollection(
  segments: TimedRouteSegment[],
  segmentWind: SegmentWind[],
): FeatureCollection<LineString> {
  return featureCollection(
    segments.map((segment) => {
      const wind = segmentWind.find((value) => value.segmentId === segment.id);
      return feature(segment.geometry, {
        id: segment.id,
        estimatedExposureMps: wind?.estimatedExposureMps ?? 0,
        estimatedWindExposureMps: wind?.estimatedWindExposureMps ?? 0,
        shelterFactor: wind?.shelterFactor ?? 0,
        opennessFactor: wind?.opennessFactor ?? 1,
        channelingFactor: wind?.channelingFactor ?? 1,
        unknownMeters: wind?.unknownMeters ?? 0,
        classification: wind?.classification ?? "neutral",
        headwindComponentMps: wind?.headwindComponentMps ?? 0,
        crosswindComponentMps: wind?.crosswindComponentMps ?? 0,
        regionalWindSpeedMps: wind?.regionalWindSpeedMps ?? 0,
        regionalWindDirectionDeg: wind?.regionalWindDirectionDeg ?? 0,
        segmentBearingDeg: wind?.segmentBearingDeg ?? segment.bearingDegrees,
        confidence: wind?.confidence ?? 0,
        estimatedMidpointTime: segment.estimatedMidpointTime,
      });
    }),
  );
}

function windVectorsToFeatureCollection(
  segments: TimedRouteSegment[],
  segmentWind: SegmentWind[],
  projectionOrigin: Coordinate,
): FeatureCollection<LineString> {
  const projection = createLocalProjection(projectionOrigin);

  return featureCollection(
    segments.flatMap((segment) => {
      const wind = segmentWind.find((value) => value.segmentId === segment.id);
      if (!wind) return [];
      const startCoordinate = segment.geometry.coordinates[0] as [number, number];
      const endCoordinate = segment.geometry.coordinates[1] as [number, number];
      const start = projection.project({
        longitude: startCoordinate[0],
        latitude: startCoordinate[1],
      });
      const end = projection.project({
        longitude: endCoordinate[0],
        latitude: endCoordinate[1],
      });
      const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2] as [
        number,
        number,
      ];
      const windMotion = bearingVector(wind.regionalWindDirectionDeg + 180);
      const arrowLengthMeters = 24;
      const arrowStart = [
        midpoint[0] - windMotion[0] * arrowLengthMeters * 0.5,
        midpoint[1] - windMotion[1] * arrowLengthMeters * 0.5,
      ] as [number, number];
      const arrowEnd = [
        midpoint[0] + windMotion[0] * arrowLengthMeters * 0.5,
        midpoint[1] + windMotion[1] * arrowLengthMeters * 0.5,
      ] as [number, number];
      const arrowStartCoordinate = projection.unproject(arrowStart);
      const arrowEndCoordinate = projection.unproject(arrowEnd);

      return [
        feature(
          {
            type: "LineString" as const,
            coordinates: [
              [arrowStartCoordinate.longitude, arrowStartCoordinate.latitude],
              [arrowEndCoordinate.longitude, arrowEndCoordinate.latitude],
            ],
          },
          {
            segmentId: segment.id,
            windFromDeg: wind.regionalWindDirectionDeg,
            windToDeg: (wind.regionalWindDirectionDeg + 180) % 360,
            speedMps: wind.regionalWindSpeedMps,
          },
        ),
      ];
    }),
  );
}

function buildingsToFeatureCollection(
  buildings: Building[],
): FeatureCollection<Polygon | MultiPolygon> {
  return featureCollection(
    buildings.map((building) =>
      feature(building.footprint, {
        id: building.id,
        heightMeters: building.heightMeters,
        heightSource: building.heightSource,
        confidence: building.confidence,
      }),
    ),
  );
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function classifySegmentWind(
  segment: SegmentWind,
  segmentMeters: number,
  unknownMeters: number,
): SegmentWind["classification"] {
  if (segmentMeters > 0 && unknownMeters / segmentMeters >= 0.5) return "unknown";
  if (segment.shelterFactor >= WIND_MODEL_CONFIG.shelteredThreshold) return "sheltered";
  if (segment.estimatedWindExposureMps >= WIND_MODEL_CONFIG.exposedThresholdMps) {
    return "exposed";
  }
  return "neutral";
}
