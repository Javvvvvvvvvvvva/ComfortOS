import fs from "node:fs/promises";
import { distance, length, lineString, point } from "@turf/turf";
import { calculateCandidateDiversity } from "@/lib/routing/candidates";
import { createConfiguredRoutingProvider } from "@/lib/routing/providers/configuredRoutingProvider";
import { RoutingService } from "@/lib/routing/service";
import type { Coordinate } from "@/lib/geo/types";
import type {
  RouteCandidate,
  RouteResult,
  RoutingProviderMetadata,
} from "@/lib/routing/types";

type ValidationRoute = {
  id: string;
  label: string;
  origin: Coordinate;
  destination: Coordinate;
};

type SnapshotRoute = {
  city: string;
  routeId: string;
  label: string;
  origin: Coordinate;
  destination: Coordinate;
  route: RouteResult;
};

type RoutingSnapshot = {
  generatedAt: string;
  provider: RoutingProviderMetadata;
  departureTime: string;
  routes: SnapshotRoute[];
};

const CITY_ROUTES = [
  ["minneapolis", "fixtures/routes/minneapolis-stage-5-5-routes.json"],
  ["seattle", "config/validation-routes/seattle-stage8.json"],
  ["phoenix", "config/validation-routes/phoenix-stage9.json"],
] as const;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const departureTime = options.departureTime ?? new Date().toISOString();
  const limit = options.limit ? Number(options.limit) : 3;
  const snapshot = await captureSnapshot(departureTime, limit);

  if (options.captureSnapshot) {
    await fs.writeFile(
      options.captureSnapshot,
      `${JSON.stringify(snapshot, null, 2)}\n`,
      "utf8",
    );
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  if (!options.baseline) {
    throw new Error(
      "Route equivalence audit requires --baseline <recorded normalized OSRM snapshot>, or use --capture-snapshot <file> to record the configured provider.",
    );
  }

  const baseline = JSON.parse(await fs.readFile(options.baseline, "utf8")) as RoutingSnapshot;
  const rows = snapshot.routes.map((managedRoute) => {
    const baselineRoute = baseline.routes.find(
      (route) =>
        route.city === managedRoute.city && route.routeId === managedRoute.routeId,
    );
    if (!baselineRoute) {
      return {
        city: managedRoute.city,
        routeId: managedRoute.routeId,
        success: false as const,
        error: "Recorded OSRM baseline route is missing.",
      };
    }

    const managedCandidate = asCandidate(managedRoute.route, "managed");
    const baselineCandidate = asCandidate(baselineRoute.route, "baseline");
    const managedToBaseline = calculateCandidateDiversity(
      managedCandidate,
      baselineCandidate,
    ).overlapWithFastest;
    const baselineToManaged = calculateCandidateDiversity(
      baselineCandidate,
      managedCandidate,
    ).overlapWithFastest;

    return {
      city: managedRoute.city,
      routeId: managedRoute.routeId,
      label: managedRoute.label,
      success: true as const,
      distance: compareNumber(
        baselineRoute.route.distanceMeters,
        managedRoute.route.distanceMeters,
      ),
      duration: compareNumber(
        baselineRoute.route.durationSeconds,
        managedRoute.route.durationSeconds,
      ),
      geometryOverlapRatio: (managedToBaseline + baselineToManaged) / 2,
      pedestrianPlausibility: auditPlausibility(managedRoute),
      manualAudit: {
        status: "required" as const,
        checks: [
          "river crossings and bridges",
          "highways and ramps",
          "pedestrian-only ways and parks",
          "disconnected shortcuts",
        ],
      },
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    baselineProvider: baseline.provider,
    managedProvider: snapshot.provider,
    routesPerCity: limit,
    rows,
    visualAuditGeoJson: {
      type: "FeatureCollection",
      features: [
        ...snapshotFeatures(baseline, "baseline"),
        ...snapshotFeatures(snapshot, "managed"),
      ],
    },
  };

  if (options.output) {
    await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
}

async function captureSnapshot(departureTime: string, limit: number) {
  const { provider, metadata } = createConfiguredRoutingProvider();
  const service = new RoutingService(provider);
  const routes: SnapshotRoute[] = [];

  for (const [city, filePath] of CITY_ROUTES) {
    const validationRoutes = JSON.parse(
      await fs.readFile(filePath, "utf8"),
    ) as ValidationRoute[];
    for (const validationRoute of validationRoutes.slice(0, limit)) {
      const route = await service.getFastestWalkingRoute({
        origin: validationRoute.origin,
        destination: validationRoute.destination,
        departureTime,
      });
      routes.push({
        city,
        routeId: validationRoute.id,
        label: validationRoute.label,
        origin: validationRoute.origin,
        destination: validationRoute.destination,
        route,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    provider: metadata,
    departureTime,
    routes,
  } satisfies RoutingSnapshot;
}

function auditPlausibility(snapshotRoute: SnapshotRoute) {
  const routeLine = lineString(snapshotRoute.route.geometry.coordinates);
  const geometryLengthMeters = length(routeLine, { units: "kilometers" }) * 1000;
  const reportedDistanceMeters = snapshotRoute.route.distanceMeters;
  const maxSegmentMeters = Math.max(
    0,
    ...snapshotRoute.route.geometry.coordinates.slice(1).map((coordinate, index) =>
      distance(
        point(snapshotRoute.route.geometry.coordinates[index]),
        point(coordinate),
        { units: "kilometers" },
      ) * 1000,
    ),
  );
  const snappedOriginOffsetMeters = coordinateDistance(
    snapshotRoute.origin,
    snapshotRoute.route.snappedOrigin,
  );
  const snappedDestinationOffsetMeters = coordinateDistance(
    snapshotRoute.destination,
    snapshotRoute.route.snappedDestination,
  );
  const issues: string[] = [];
  const geometryDistanceRatio =
    reportedDistanceMeters > 0 ? geometryLengthMeters / reportedDistanceMeters : 0;
  if (geometryDistanceRatio < 0.75 || geometryDistanceRatio > 1.25) {
    issues.push("reported distance is inconsistent with normalized geometry length");
  }
  if (maxSegmentMeters > 300) issues.push("geometry contains a segment longer than 300 m");
  if (snappedOriginOffsetMeters !== null && snappedOriginOffsetMeters > 100) {
    issues.push("origin snapped more than 100 m from the requested point");
  }
  if (snappedDestinationOffsetMeters !== null && snappedDestinationOffsetMeters > 100) {
    issues.push("destination snapped more than 100 m from the requested point");
  }

  return {
    automaticChecksPassed: issues.length === 0,
    geometryLengthMeters,
    reportedDistanceMeters,
    geometryDistanceRatio,
    maxSegmentMeters,
    snappedOriginOffsetMeters,
    snappedDestinationOffsetMeters,
    issues,
  };
}

function coordinateDistance(requested: Coordinate, snapped?: Coordinate) {
  if (!snapped) return null;
  return (
    distance(
      point([requested.longitude, requested.latitude]),
      point([snapped.longitude, snapped.latitude]),
      { units: "kilometers" },
    ) * 1000
  );
}

function compareNumber(baseline: number, managed: number) {
  return {
    baseline,
    managed,
    difference: managed - baseline,
    differenceRatio: baseline > 0 ? (managed - baseline) / baseline : null,
  };
}

function asCandidate(route: RouteResult, id: string): RouteCandidate {
  return { ...route, id, sourceRouteIndex: 0 };
}

function snapshotFeatures(snapshot: RoutingSnapshot, source: "baseline" | "managed") {
  return snapshot.routes.map((route) => ({
    type: "Feature",
    properties: {
      source,
      provider: snapshot.provider.id,
      city: route.city,
      routeId: route.routeId,
      label: route.label,
      distanceMeters: route.route.distanceMeters,
      durationSeconds: route.route.durationSeconds,
    },
    geometry: route.route.geometry,
  }));
}

function parseArgs(args: string[]) {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    }
    options[key.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return options;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
