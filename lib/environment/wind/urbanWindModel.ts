import type { MultiPolygon, Polygon } from "geojson";
import type { Building } from "@/lib/environment/buildings/types";
import { createLocalProjection, type ProjectedPoint } from "@/lib/environment/shade/projection";
import type { TimedRouteSegment } from "@/lib/environment/shade/types";
import type {
  SegmentWind,
  UrbanWindContext,
  UrbanWindModel,
  WindState,
} from "@/lib/environment/wind/types";
import {
  bearingVector,
  calculateWindComponents,
  normalizeDegrees,
} from "@/lib/environment/wind/windVector";

export const WIND_MODEL_CONFIG = {
  nearbyBuildingRadiusMeters: 55,
  shelterLengthHeightMultiplier: 8,
  shelterWidthNormalizerMeters: 24,
  shelterReductionMax: 0.62,
  minimumShelterHeightMeters: 3,
  oneSidedOpennessFactor: 0.68,
  canyonOpennessFactor: 0.42,
  openOpennessFactor: 1,
  channelingAlignmentDeg: 25,
  channelingMaxAmplification: 1.12,
  shelteredThreshold: 0.28,
  exposedThresholdMps: 2.5,
  unknownHeightInfluenceMeters: 35,
  unknownHeightMaxSegmentPenalty: 0.45,
  floorDerivedHeightWeight: 0.65,
  unknownHeightWeight: 0.2,
  shelterModelBaseConfidence: 0.68,
} as const;

type BuildingShape = {
  building: Building;
  centroid: ProjectedPoint;
  points: ProjectedPoint[];
  heightMeters: number | null;
};

export class HeuristicUrbanWindModel implements UrbanWindModel {
  estimateSegmentWind(
    segment: TimedRouteSegment,
    regionalWind: WindState,
    context: UrbanWindContext,
  ): SegmentWind {
    const projection = createLocalProjection(context.projectionOrigin);
    const segmentStart = segment.geometry.coordinates[0] as [number, number];
    const segmentEnd = segment.geometry.coordinates[1] as [number, number];
    const start = projection.project({ longitude: segmentStart[0], latitude: segmentStart[1] });
    const end = projection.project({ longitude: segmentEnd[0], latitude: segmentEnd[1] });
    const midpoint: ProjectedPoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const segmentVector = normalizeVector([end[0] - start[0], end[1] - start[1]]);
    const leftNormal: ProjectedPoint = [-segmentVector[1], segmentVector[0]];
    const windFromVector = bearingVector(regionalWind.directionFromDeg);
    const buildingShapes = context.buildings.flatMap((building) =>
      projectBuilding(building, context.projectionOrigin),
    );
    const nearbyBuildings = buildingShapes.filter(
      (shape) => distance(midpoint, shape.centroid) <= WIND_MODEL_CONFIG.nearbyBuildingRadiusMeters,
    );
    const components = calculateWindComponents({
      pedestrianBearingDeg: segment.bearingDegrees,
      windFromDeg: regionalWind.directionFromDeg,
      windSpeedMps: regionalWind.speedMps,
    });
    const shelterFactor = calculateShelterFactor({
      midpoint,
      windFromVector,
      buildingShapes: nearbyBuildings,
    });
    const opennessFactor = calculateOpennessFactor({
      midpoint,
      leftNormal,
      nearbyBuildings,
    });
    const channelingFactor = calculateChannelingFactor({
      pedestrianBearingDeg: segment.bearingDegrees,
      windMotionBearingDeg: normalizeDegrees(regionalWind.directionFromDeg + 180),
      opennessFactor,
    });
    const directionalExposure =
      components.headwindComponentMps +
      components.crosswindComponentMps * 0.85 +
      components.tailwindComponentMps * 0.55;
    const estimatedExposureMps =
      directionalExposure *
      (1 - shelterFactor * WIND_MODEL_CONFIG.shelterReductionMax) *
      channelingFactor;
    const localHeightCoverage = calculateHeightCoverage(nearbyBuildings);
    const confidence = clamp01(
      regionalWind.confidence *
        WIND_MODEL_CONFIG.shelterModelBaseConfidence *
        (0.7 + localHeightCoverage * 0.3),
    );

    return {
      segmentId: segment.id,
      regionalWindSpeedMps: regionalWind.speedMps,
      regionalWindDirectionDeg: regionalWind.directionFromDeg,
      windDataConfidence: regionalWind.confidence,
      segmentBearingDeg: segment.bearingDegrees,
      relativeWindAngleDeg: components.relativeWindAngleDeg,
      headwindComponentMps: components.headwindComponentMps,
      crosswindComponentMps: components.crosswindComponentMps,
      tailwindComponentMps: components.tailwindComponentMps,
      shelterFactor,
      opennessFactor,
      channelingFactor,
      estimatedExposureMps,
      estimatedWindExposureMps: estimatedExposureMps,
      unknownMeters: 0,
      classification: "neutral",
      confidence,
      estimatedEntryTime: segment.estimatedEntryTime,
      estimatedMidpointTime: segment.estimatedMidpointTime,
      estimatedExitTime: segment.estimatedExitTime,
    };
  }
}

export function calculateShelterFactor({
  midpoint,
  windFromVector,
  buildingShapes,
}: {
  midpoint: ProjectedPoint;
  windFromVector: ProjectedPoint;
  buildingShapes: BuildingShape[];
}) {
  const perpendicular: ProjectedPoint = [-windFromVector[1], windFromVector[0]];
  const strongestShelter = buildingShapes.reduce((strongest, shape) => {
    if (!shape.heightMeters || shape.heightMeters < WIND_MODEL_CONFIG.minimumShelterHeightMeters) {
      return strongest;
    }

    const fromSegmentToBuilding: ProjectedPoint = [
      shape.centroid[0] - midpoint[0],
      shape.centroid[1] - midpoint[1],
    ];
    const upwindDistance = dot(fromSegmentToBuilding, windFromVector);
    if (upwindDistance <= 0) return strongest;

    const maxShelterDistance =
      shape.heightMeters * WIND_MODEL_CONFIG.shelterLengthHeightMultiplier;
    if (upwindDistance > maxShelterDistance) return strongest;

    const halfWidth = projectedWidth(shape.points, perpendicular) / 2;
    const lateralOffset = Math.abs(dot(fromSegmentToBuilding, perpendicular));
    if (lateralOffset > halfWidth + WIND_MODEL_CONFIG.shelterWidthNormalizerMeters) {
      return strongest;
    }

    const heightWeight = clamp01(shape.heightMeters / 30);
    const distanceWeight = clamp01(1 - upwindDistance / maxShelterDistance);
    const widthWeight = clamp01(
      projectedWidth(shape.points, perpendicular) /
        WIND_MODEL_CONFIG.shelterWidthNormalizerMeters,
    );
    const lateralWeight = clamp01(
      1 - lateralOffset / (halfWidth + WIND_MODEL_CONFIG.shelterWidthNormalizerMeters),
    );
    const provenanceWeight = heightSourceWeight(shape.building);

    return Math.max(
      strongest,
      clamp01(heightWeight * distanceWeight * widthWeight * lateralWeight * provenanceWeight),
    );
  }, 0);

  return strongestShelter;
}

export function calculateUnknownHeightInfluence(segment: TimedRouteSegment, buildings: Building[]) {
  const strongestInfluence = buildings.reduce((strongest, building) => {
    if (building.heightMeters) return strongest;
    const distanceToSegment = buildingDistanceToSegmentApprox(segment, building);
    if (distanceToSegment > WIND_MODEL_CONFIG.unknownHeightInfluenceMeters) return strongest;

    const distanceWeight = clamp01(
      1 - distanceToSegment / WIND_MODEL_CONFIG.unknownHeightInfluenceMeters,
    );
    return Math.max(
      strongest,
      distanceWeight * WIND_MODEL_CONFIG.unknownHeightMaxSegmentPenalty,
    );
  }, 0);

  return segment.distanceMeters * strongestInfluence;
}

function calculateOpennessFactor({
  midpoint,
  leftNormal,
  nearbyBuildings,
}: {
  midpoint: ProjectedPoint;
  leftNormal: ProjectedPoint;
  nearbyBuildings: BuildingShape[];
}) {
  const sideOccupancy = nearbyBuildings.reduce(
    (occupancy, shape) => {
      const offset: ProjectedPoint = [
        shape.centroid[0] - midpoint[0],
        shape.centroid[1] - midpoint[1],
      ];
      const side = dot(offset, leftNormal);
      if (Math.abs(side) > WIND_MODEL_CONFIG.nearbyBuildingRadiusMeters) return occupancy;
      if (side >= 0) occupancy.left = true;
      if (side <= 0) occupancy.right = true;
      return occupancy;
    },
    { left: false, right: false },
  );

  if (sideOccupancy.left && sideOccupancy.right) return WIND_MODEL_CONFIG.canyonOpennessFactor;
  if (sideOccupancy.left || sideOccupancy.right) return WIND_MODEL_CONFIG.oneSidedOpennessFactor;
  return WIND_MODEL_CONFIG.openOpennessFactor;
}

function calculateChannelingFactor({
  pedestrianBearingDeg,
  windMotionBearingDeg,
  opennessFactor,
}: {
  pedestrianBearingDeg: number;
  windMotionBearingDeg: number;
  opennessFactor: number;
}) {
  if (opennessFactor > WIND_MODEL_CONFIG.canyonOpennessFactor) return 1;
  const alignment = Math.min(
    Math.abs(pedestrianBearingDeg - windMotionBearingDeg),
    360 - Math.abs(pedestrianBearingDeg - windMotionBearingDeg),
  );
  const streetAligned = Math.min(alignment, 180 - alignment);
  if (streetAligned > WIND_MODEL_CONFIG.channelingAlignmentDeg) return 1;

  const alignmentWeight =
    1 - streetAligned / WIND_MODEL_CONFIG.channelingAlignmentDeg;
  return 1 + (WIND_MODEL_CONFIG.channelingMaxAmplification - 1) * alignmentWeight;
}

function calculateHeightCoverage(buildings: BuildingShape[]) {
  if (!buildings.length) return 1;
  return clamp01(
    buildings.reduce((sum, shape) => sum + heightSourceWeight(shape.building), 0) /
      buildings.length,
  );
}

function projectBuilding(
  building: Building,
  projectionOrigin: import("@/lib/geo/types").Coordinate,
): BuildingShape[] {
  const projection = createLocalProjection(projectionOrigin);
  const points = polygonParts(building.footprint).flatMap((polygon) =>
    (polygon.coordinates[0] ?? []).flatMap(([longitude, latitude]) => {
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
      return [projection.project({ longitude, latitude })];
    }),
  );
  if (!points.length) return [];
  const centroid = points.length
    ? ([
        points.reduce((sum, point) => sum + point[0], 0) / points.length,
        points.reduce((sum, point) => sum + point[1], 0) / points.length,
      ] as ProjectedPoint)
    : ([0, 0] as ProjectedPoint);

  return [
    {
      building,
      centroid,
      points,
      heightMeters: building.heightMeters ?? null,
    },
  ];
}

function buildingDistanceToSegmentApprox(segment: TimedRouteSegment, building: Building) {
  const routePoint = segment.geometry.coordinates[0] as [number, number];
  const projectionOrigin = { latitude: routePoint[1], longitude: routePoint[0] };
  const projection = createLocalProjection(projectionOrigin);
  const segmentStart = projection.project({
    longitude: segment.geometry.coordinates[0][0],
    latitude: segment.geometry.coordinates[0][1],
  });
  const segmentEnd = projection.project({
    longitude: segment.geometry.coordinates[1][0],
    latitude: segment.geometry.coordinates[1][1],
  });
  const shape = projectBuilding(building, projectionOrigin)[0];
  if (!shape) return Number.POSITIVE_INFINITY;
  return pointToSegmentDistance(shape.centroid, segmentStart, segmentEnd);
}

function pointToSegmentDistance(point: ProjectedPoint, start: ProjectedPoint, end: ProjectedPoint) {
  const segmentVector: ProjectedPoint = [end[0] - start[0], end[1] - start[1]];
  const lengthSquared = dot(segmentVector, segmentVector);
  if (lengthSquared === 0) return distance(point, start);
  const t = clamp01(dot([point[0] - start[0], point[1] - start[1]], segmentVector) / lengthSquared);
  return distance(point, [start[0] + segmentVector[0] * t, start[1] + segmentVector[1] * t]);
}

function polygonParts(geometry: Polygon | MultiPolygon): Polygon[] {
  if (geometry.type === "Polygon") return geometry.coordinates[0]?.length ? [geometry] : [];
  return geometry.coordinates.flatMap((coordinates) =>
    coordinates[0]?.length ? [{ type: "Polygon" as const, coordinates }] : [],
  );
}

function projectedWidth(points: ProjectedPoint[], axis: ProjectedPoint) {
  if (!points.length) return 0;
  const projections = points.map((point) => dot(point, axis));
  return Math.max(...projections) - Math.min(...projections);
}

function normalizeVector(point: ProjectedPoint): ProjectedPoint {
  const magnitude = Math.hypot(point[0], point[1]);
  if (magnitude === 0) return [0, 0];
  return [point[0] / magnitude, point[1] / magnitude];
}

function heightSourceWeight(building: Building) {
  if (building.heightSource === "provider" || building.heightSource === "measured") return 1;
  if (building.heightSource === "floors-derived") {
    return WIND_MODEL_CONFIG.floorDerivedHeightWeight;
  }
  return WIND_MODEL_CONFIG.unknownHeightWeight;
}

function dot(left: ProjectedPoint, right: ProjectedPoint) {
  return left[0] * right[0] + left[1] * right[1];
}

function distance(left: ProjectedPoint, right: ProjectedPoint) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
