import { convex, featureCollection, point } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
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
  ): ShadowResult;
};

export class BuildingShadowEngine implements ShadowEngine {
  calculateBuildingShadows(
    buildings: Building[],
    solarPosition: SolarPosition,
    projectionOrigin: Coordinate,
  ): ShadowResult {
    if (!solarPosition.sunAboveHorizon || solarPosition.elevationDeg <= 0) {
      return { status: "night", solarPosition, shadows: [] };
    }

    return {
      status: "daylight",
      solarPosition,
      shadows: buildings.flatMap((building) =>
        calculateBuildingShadow(building, solarPosition, projectionOrigin),
      ),
    };
  }
}

export function calculateBuildingShadow(
  building: Building,
  solarPosition: SolarPosition,
  projectionOrigin: Coordinate,
): BuildingShadow[] {
  if (!building.heightMeters || building.heightMeters <= 0) return [];
  const heightMeters = building.heightMeters;

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
  const projection = createLocalProjection(projectionOrigin);

  return polygonParts(building.footprint).flatMap((polygon, index) => {
    const projectedPoints = polygon.coordinates[0].map(([longitude, latitude]) =>
      projection.project({ latitude, longitude }),
    );
    const shadowPoints = projectedPoints.flatMap(([x, y]) => [
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
        buildingId: index === 0 ? building.id : `${building.id}:part-${index + 1}`,
        geometry: hull.geometry,
        sourceHeightMeters: heightMeters,
        confidence: building.confidence,
      },
    ];
  });
}

function polygonParts(geometry: Polygon | MultiPolygon): Polygon[] {
  if (geometry.type === "Polygon") return [geometry];
  return geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }));
}
