import type { BoundingBox } from "@/lib/environment/buildings/types";
import type { Coordinate, LineStringGeometry } from "@/lib/geo/types";

const EARTH_RADIUS_METERS = 6371008.8;

export function expandBounds(bounds: BoundingBox, meters: number): BoundingBox {
  const centerLatitude = (bounds.north + bounds.south) / 2;
  const latitudeDelta = metersToLatitudeDegrees(meters);
  const longitudeDelta = metersToLongitudeDegrees(meters, centerLatitude);

  return {
    west: bounds.west - longitudeDelta,
    south: bounds.south - latitudeDelta,
    east: bounds.east + longitudeDelta,
    north: bounds.north + latitudeDelta,
  };
}

export function boundsForLineString(
  geometry: LineStringGeometry,
  paddingMeters = 80,
): BoundingBox {
  const [first] = geometry.coordinates;
  const initial = {
    west: first[0],
    south: first[1],
    east: first[0],
    north: first[1],
  };

  const bounds = geometry.coordinates.reduce(
    (current, [longitude, latitude]) => ({
      west: Math.min(current.west, longitude),
      south: Math.min(current.south, latitude),
      east: Math.max(current.east, longitude),
      north: Math.max(current.north, latitude),
    }),
    initial,
  );

  return expandBounds(bounds, paddingMeters);
}

export function boundsCenter(bounds: BoundingBox): Coordinate {
  return {
    latitude: (bounds.north + bounds.south) / 2,
    longitude: (bounds.east + bounds.west) / 2,
  };
}

function metersToLatitudeDegrees(meters: number) {
  return (meters / EARTH_RADIUS_METERS) * (180 / Math.PI);
}

function metersToLongitudeDegrees(meters: number, latitude: number) {
  const cosLatitude = Math.cos((latitude * Math.PI) / 180);
  return metersToLatitudeDegrees(meters) / Math.max(cosLatitude, 0.01);
}
