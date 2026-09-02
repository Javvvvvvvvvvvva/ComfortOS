import { convex, featureCollection, point } from "@turf/turf";
import type { Feature, LineString, MultiPolygon, Polygon } from "geojson";
import type { Building } from "@/lib/environment/buildings/types";
import type { SolarPosition } from "@/lib/environment/solar/solarPositionEngine";
import { createLocalProjection, degreesToRadians } from "@/lib/environment/shade/projection";
import type { BuildingShadow, ShadowResult } from "@/lib/environment/shade/types";
import type { Coordinate } from "@/lib/geo/types";

const MAX_SHADOW_LENGTH_METERS = 1200;

export type ShadowEngine = {
  calculateBuildingShadows(
    buildings: Building[],
    solarPosition: SolarPosition,
    projectionOrigin: Coordinate,
    preparedBuildingContext?: PreparedShadowBuildingContext,
    targetGeometry?: LineString,
  ): ShadowResult;
};

type ProjectedBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type PreparedShadowBuildingPart = {
  building: Building;
  buildingId: string;
  projectedPoints: Array<[number, number]>;
  projectedBounds: ProjectedBounds;
};

export type PreparedShadowBuildingContext = {
  projectionOrigin: Coordinate;
  parts: PreparedShadowBuildingPart[];
};

export class BuildingShadowEngine implements ShadowEngine {
  calculateBuildingShadows(
    buildings: Building[],
    solarPosition: SolarPosition,
    projectionOrigin: Coordinate,
    preparedBuildingContext?: PreparedShadowBuildingContext,
    targetGeometry?: LineString,
  ): ShadowResult {
    if (!solarPosition.sunAboveHorizon || solarPosition.elevationDeg <= 0) {
      return { status: "night", solarPosition, shadows: [] };
    }

    const prepared =
      preparedBuildingContext ?? prepareShadowBuildingContext(buildings, projectionOrigin);
    const projection = createLocalProjection(prepared.projectionOrigin);
    const targetBounds = targetGeometry
      ? projectedLineBounds(targetGeometry, projection)
      : undefined;

    return {
      status: "daylight",
      solarPosition,
      shadows: prepared.parts.flatMap((part) =>
        calculatePreparedBuildingShadow(part, solarPosition, projection, targetBounds),
      ),
    };
  }
}

export function prepareShadowBuildingContext(
  buildings: Building[],
  projectionOrigin: Coordinate,
): PreparedShadowBuildingContext {
  const projection = createLocalProjection(projectionOrigin);
  return {
    projectionOrigin,
    parts: buildings.flatMap((building) =>
      polygonParts(building.footprint).map((polygon, index) => {
        const projectedPoints = polygon.coordinates[0].map(([longitude, latitude]) =>
          projection.project({ latitude, longitude }),
        );
        return {
          building,
          buildingId: index === 0 ? building.id : `${building.id}:part-${index + 1}`,
          projectedPoints,
          projectedBounds: boundsForProjectedPoints(projectedPoints),
        };
      }),
    ),
  };
}

export function isPreparedShadowBuildingContext(
  value: unknown,
): value is PreparedShadowBuildingContext {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as PreparedShadowBuildingContext).parts) &&
    typeof (value as PreparedShadowBuildingContext).projectionOrigin?.latitude === "number"
  );
}

export function calculateBuildingShadow(
  building: Building,
  solarPosition: SolarPosition,
  projectionOrigin: Coordinate,
): BuildingShadow[] {
  const prepared = prepareShadowBuildingContext([building], projectionOrigin);
  const projection = createLocalProjection(projectionOrigin);
  return prepared.parts.flatMap((part) =>
    calculatePreparedBuildingShadow(part, solarPosition, projection),
  );
}

function calculatePreparedBuildingShadow(
  part: PreparedShadowBuildingPart,
  solarPosition: SolarPosition,
  projection: ReturnType<typeof createLocalProjection>,
  targetBounds?: ProjectedBounds,
): BuildingShadow[] {
  const heightMeters = part.building.heightMeters;
  if (!heightMeters || heightMeters <= 0) return [];

  const shadowLength = Math.min(
    heightMeters / Math.tan(degreesToRadians(solarPosition.elevationDeg)),
    MAX_SHADOW_LENGTH_METERS,
  );
  if (!Number.isFinite(shadowLength) || shadowLength <= 0) return [];

  const shadowAzimuth = (solarPosition.azimuthDeg + 180) % 360;
  const shadowAzimuthRad = degreesToRadians(shadowAzimuth);
  const offset = {
    x: Math.sin(shadowAzimuthRad) * shadowLength,
    y: Math.cos(shadowAzimuthRad) * shadowLength,
  };
  if (
    targetBounds &&
    !intersectsProjectedBounds(targetBounds, {
      minX: Math.min(part.projectedBounds.minX, part.projectedBounds.minX + offset.x),
      minY: Math.min(part.projectedBounds.minY, part.projectedBounds.minY + offset.y),
      maxX: Math.max(part.projectedBounds.maxX, part.projectedBounds.maxX + offset.x),
      maxY: Math.max(part.projectedBounds.maxY, part.projectedBounds.maxY + offset.y),
    })
  ) {
    return [];
  }
  const shadowPoints = part.projectedPoints.flatMap(([x, y]) => [
      projection.unproject([x, y]),
      projection.unproject([x + offset.x, y + offset.y]),
  ]);
  const hull = convex(
    featureCollection(
      shadowPoints.map((coordinate) =>
        point([coordinate.longitude, coordinate.latitude]),
      ),
    ),
  ) as Feature<Polygon> | null;

  if (!hull?.geometry) return [];

  return [
    {
      buildingId: part.buildingId,
      geometry: hull.geometry,
      sourceHeightMeters: heightMeters,
      confidence: part.building.confidence,
    },
  ];
}

function polygonParts(geometry: Polygon | MultiPolygon): Polygon[] {
  if (geometry.type === "Polygon") return [geometry];
  return geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }));
}

function projectedLineBounds(
  geometry: LineString,
  projection: ReturnType<typeof createLocalProjection>,
): ProjectedBounds | undefined {
  const points = geometry.coordinates.flatMap(([longitude, latitude]) =>
    Number.isFinite(longitude) && Number.isFinite(latitude)
      ? [projection.project({ longitude, latitude })]
      : [],
  );
  return points.length > 0 ? boundsForProjectedPoints(points) : undefined;
}

function boundsForProjectedPoints(points: Array<[number, number]>): ProjectedBounds {
  return points.reduce<ProjectedBounds>(
    (bounds, [x, y]) => ({
      minX: Math.min(bounds.minX, x),
      minY: Math.min(bounds.minY, y),
      maxX: Math.max(bounds.maxX, x),
      maxY: Math.max(bounds.maxY, y),
    }),
    {
      minX: points[0]?.[0] ?? 0,
      minY: points[0]?.[1] ?? 0,
      maxX: points[0]?.[0] ?? 0,
      maxY: points[0]?.[1] ?? 0,
    },
  );
}

function intersectsProjectedBounds(left: ProjectedBounds, right: ProjectedBounds) {
  return !(
    left.maxX < right.minX ||
    left.minX > right.maxX ||
    left.maxY < right.minY ||
    left.minY > right.maxY
  );
}
