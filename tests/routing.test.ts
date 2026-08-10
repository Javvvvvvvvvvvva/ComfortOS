import assert from "node:assert/strict";
import test from "node:test";
import { formatCoordinate, formatDistance, formatDuration } from "@/lib/geo/format";
import { isValidCoordinate } from "@/lib/geo/validation";
import {
  normalizeOsrmRouteCandidatesResponse,
  normalizeOsrmRouteResponse,
} from "@/lib/routing/providers/osrmWalkingProvider";
import { deduplicateRouteCandidates } from "@/lib/routing/candidates";
import { RoutingService } from "@/lib/routing/service";
import type { RoutingProvider } from "@/lib/routing/types";

test("validates coordinate ranges", () => {
  assert.equal(isValidCoordinate({ latitude: 44.98, longitude: -93.27 }), true);
  assert.equal(isValidCoordinate({ latitude: 91, longitude: -93.27 }), false);
  assert.equal(isValidCoordinate({ latitude: 44.98, longitude: -181 }), false);
});

test("formats route distance, duration, and selected coordinates", () => {
  assert.equal(formatDistance(2414), "1.5 mi");
  assert.equal(formatDistance(-1), "Unavailable");
  assert.equal(formatDuration(780), "13 min");
  assert.equal(formatDuration(3660), "1 hr 1 min");
  assert.equal(
    formatCoordinate({ latitude: 44.977753, longitude: -93.265011 }),
    "44.97775, -93.26501",
  );
});

test("normalizes an OSRM route response", () => {
  const result = normalizeOsrmRouteResponse({
    code: "Ok",
    data_version: "2026-08-07T00:00:00Z",
    routes: [
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-93.265, 44.9778],
            [-93.268, 44.98],
          ],
        },
        distance: 806.4,
        duration: 612,
      },
    ],
    waypoints: [
      { location: [-93.2651, 44.9779] },
      { location: [-93.2682, 44.9801] },
    ],
  });

  assert.equal(result.distanceMeters, 806.4);
  assert.equal(result.durationSeconds, 612);
  assert.equal(result.snappedOrigin?.latitude, 44.9779);
  assert.equal(result.snappedDestination?.longitude, -93.2682);
  assert.equal(result.provider?.id, "fossgis-osrm-foot");
  assert.equal(result.geometry.coordinates.length, 2);
});

test("normalizes OSRM alternative route candidates", () => {
  const result = normalizeOsrmRouteCandidatesResponse({
    code: "Ok",
    routes: [
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-93.265, 44.9778],
            [-93.268, 44.98],
          ],
        },
        distance: 806.4,
        duration: 612,
      },
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-93.265, 44.9778],
            [-93.266, 44.979],
            [-93.268, 44.98],
          ],
        },
        distance: 884,
        duration: 702,
      },
    ],
  });

  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].id, "osrm-1");
  assert.equal(result.candidates[1].sourceRouteIndex, 1);
});

test("deduplicates nearly identical route candidates", () => {
  const candidates = normalizeOsrmRouteCandidatesResponse({
    code: "Ok",
    routes: [
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-93.265, 44.9778],
            [-93.266, 44.9788],
            [-93.268, 44.98],
          ],
        },
        distance: 800,
        duration: 600,
      },
      {
        geometry: {
          type: "LineString",
          coordinates: [
            [-93.26501, 44.97781],
            [-93.26601, 44.97881],
            [-93.26801, 44.98001],
          ],
        },
        distance: 802,
        duration: 606,
      },
    ],
  }).candidates;

  assert.equal(deduplicateRouteCandidates(candidates).length, 1);
});

test("rejects malformed provider output", () => {
  assert.throws(
    () =>
      normalizeOsrmRouteResponse({
        code: "Ok",
        routes: [{ geometry: { type: "Point", coordinates: [-93.2, 44.9] } }],
      }),
    /malformed route geometry|malformed distance/,
  );
});

test("routing service requires a departure time from the start", async () => {
  const provider: RoutingProvider = {
    async getWalkingRoute() {
      throw new Error("Provider should not be called for invalid requests.");
    },
  };
  const service = new RoutingService(provider);

  await assert.rejects(
    service.getFastestWalkingRoute({
      origin: { latitude: 44.98, longitude: -93.27 },
      destination: { latitude: 44.99, longitude: -93.26 },
      departureTime: "",
    }),
    /Departure time/,
  );
});
