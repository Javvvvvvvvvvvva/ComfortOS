import * as SunCalc from "suncalc";

export type SolarPositionRequest = {
  latitude: number;
  longitude: number;
  timestamp: string;
};

export type SolarPosition = {
  azimuthDeg: number;
  elevationDeg: number;
  timestamp: string;
  sunAboveHorizon: boolean;
};

export function calculateSolarPosition(
  request: SolarPositionRequest,
): SolarPosition {
  const date = new Date(request.timestamp);
  if (Number.isNaN(date.valueOf())) throw new Error("Invalid solar timestamp.");

  const position = SunCalc.getPosition(
    date,
    request.latitude,
    request.longitude,
  );
  const elevationDeg = position.altitude;
  const azimuthDeg = ((position.azimuth % 360) + 360) % 360;

  return {
    azimuthDeg,
    elevationDeg,
    timestamp: date.toISOString(),
    sunAboveHorizon: elevationDeg > 0,
  };
}
