export type ComfortRouteEventName =
  | "route_requested"
  | "fastest_ready"
  | "comfort_analysis_started"
  | "comfort_analysis_completed"
  | "comfort_route_different"
  | "comfort_route_same"
  | "comfort_analysis_limited"
  | "route_selected";

export type ComfortRouteEvent = {
  name: ComfortRouteEventName;
  timestamp: string;
  metadata?: Record<string, string | number | boolean>;
};

export function createRouteEvent(
  name: ComfortRouteEventName,
  metadata?: ComfortRouteEvent["metadata"],
): ComfortRouteEvent {
  return {
    name,
    timestamp: new Date().toISOString(),
    ...(metadata ? { metadata } : {}),
  };
}
