export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type LineStringGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

export const MINNEAPOLIS_CENTER: Coordinate = {
  latitude: 44.9778,
  longitude: -93.265,
};
