export type GeolocationStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable"
  | "timeout"
  | "error";

export function messageForGeolocationStatus(status: GeolocationStatus): string | null {
  switch (status) {
    case "requesting":
      return "Finding your location...";
    case "granted":
      return "Using your current location as origin.";
    case "denied":
      return "Location permission was denied. You can still search or tap the map.";
    case "unavailable":
      return "Current location is unavailable. You can still search or tap the map.";
    case "timeout":
      return "Location lookup timed out. You can still search or tap the map.";
    case "error":
      return "Could not use current location. You can still search or tap the map.";
    default:
      return null;
  }
}

export function statusFromGeolocationError(error: GeolocationPositionError): GeolocationStatus {
  if (error.code === error.PERMISSION_DENIED) return "denied";
  if (error.code === error.POSITION_UNAVAILABLE) return "unavailable";
  if (error.code === error.TIMEOUT) return "timeout";
  return "error";
}
