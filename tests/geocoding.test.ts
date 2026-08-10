import assert from "node:assert/strict";
import test from "node:test";
import { messageForGeolocationStatus } from "@/lib/geolocation/state";
import { normalizePhotonFeatureCollection } from "@/lib/geocoding/providers/photonProvider";
import { normalizeSearchQuery, shouldRequestSearch } from "@/lib/search/searchBehavior";

test("normalizes Photon geocoding features into PlaceResult", () => {
  const places = normalizePhotonFeatureCollection({
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [-93.235444, 44.973924],
        },
        properties: {
          name: "University of Minnesota",
          street: "Church Street Southeast",
          city: "Minneapolis",
          state: "Minnesota",
          country: "United States",
          countrycode: "US",
          osm_key: "amenity",
          osm_value: "university",
          osm_type: "W",
          osm_id: 12345,
        },
      },
    ],
  });

  assert.equal(places.length, 1);
  assert.equal(places[0].id, "photon:W:12345");
  assert.equal(places[0].name, "University of Minnesota");
  assert.equal(places[0].category, "amenity:university");
  assert.equal(places[0].coordinate.latitude, 44.973924);
  assert.match(places[0].address ?? "", /Minneapolis/);
});

test("drops malformed Photon features without leaking provider shape", () => {
  const places = normalizePhotonFeatureCollection({
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [[-93.2, 44.9]],
        },
        properties: {
          name: "Bad geometry",
        },
      },
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [-93.2, 44.9],
        },
        properties: {},
      },
    ],
  });

  assert.deepEqual(places, []);
});

test("rejects malformed Photon response roots", () => {
  assert.throws(
    () => normalizePhotonFeatureCollection({ features: undefined }),
    /malformed results/,
  );
});

test("normalizes and gates search queries", () => {
  assert.equal(normalizeSearchQuery("  123   Main   St "), "123 Main St");
  assert.equal(shouldRequestSearch("ab"), false);
  assert.equal(shouldRequestSearch("  IDS Center "), true);
});

test("maps geolocation states to consumer feedback", () => {
  assert.equal(messageForGeolocationStatus("idle"), null);
  assert.match(messageForGeolocationStatus("requesting") ?? "", /Finding/);
  assert.match(messageForGeolocationStatus("denied") ?? "", /denied/);
  assert.match(messageForGeolocationStatus("timeout") ?? "", /timed out/);
});
