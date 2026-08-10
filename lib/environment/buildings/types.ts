import type { Feature, MultiPolygon, Polygon } from "geojson";

export type BoundingBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type HeightSource =
  | "measured"
  | "provider"
  | "floors-derived"
  | "unknown";

export type Building = {
  id: string;
  footprint: Polygon | MultiPolygon;
  heightMeters?: number | null;
  minHeightMeters?: number | null;
  floors?: number | null;
  source: string;
  confidence: number;
  heightSource: HeightSource;
};

export type BuildingProvider = {
  getBuildings(bounds: BoundingBox): Promise<Building[]>;
};

export type BuildingCoverage = {
  buildingCount: number;
  usableBuildingCount: number;
  explicitHeightBuildingCount: number;
  floorDerivedHeightBuildingCount: number;
  unknownHeightBuildingCount: number;
};

export type BuildingDebugFeature = Feature<Polygon | MultiPolygon, {
  id: string;
  heightMeters?: number | null;
  heightSource: HeightSource;
  confidence: number;
}>;
