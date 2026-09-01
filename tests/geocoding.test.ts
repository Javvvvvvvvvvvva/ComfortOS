import assert from "node:assert/strict";
import test from "node:test";
import { messageForGeolocationStatus } from "@/lib/geolocation/state";
import { createConfiguredGeocodingProvider } from "@/lib/geocoding/providers/configuredGeocodingProvider";
import {
  MapboxSearchBoxProvider,
  normalizeMapboxFeatureCollection,
  normalizeMapboxSuggestions,
} from "@/lib/geocoding/providers/mapboxSearchBoxProvider";
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

test("normalizes current Mapbox POI suggestions and omits closed listings", () => {
  const suggestions = normalizeMapboxSuggestions({
    suggestions: [
      {
        mapbox_id: "poi.current-karaoke",
        name: "Current Karaoke",
        feature_type: "poi",
        full_address: "100 Main St, Minneapolis, Minnesota 55401",
        poi_category: ["karaoke", "nightlife"],
        operational_status: "active",
      },
      {
        mapbox_id: "poi.old-salon",
        name: "Old Hair Salon",
        feature_type: "poi",
        full_address: "100 Main St, Minneapolis, Minnesota 55401",
        poi_category: ["hairdresser"],
        operational_status: "closed",
      },
    ],
  });

  assert.deepEqual(suggestions, [
    {
      id: "mapbox:poi.current-karaoke",
      name: "Current Karaoke",
      address: "100 Main St, Minneapolis, Minnesota 55401",
      category: "karaoke",
    },
  ]);
  assert.equal("coordinate" in suggestions[0], false);
});

test("normalizes a retrieved Mapbox POI into PlaceResult", () => {
  const places = normalizeMapboxFeatureCollection({
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-93.265, 44.9778] },
        properties: {
          mapbox_id: "poi.current-karaoke",
          name: "Current Karaoke",
          feature_type: "poi",
          address: "100 Main St",
          place_formatted: "Minneapolis, Minnesota 55401",
          poi_category: ["karaoke", "nightlife"],
        },
      },
    ],
  });

  assert.equal(places[0].id, "mapbox:poi.current-karaoke");
  assert.equal(places[0].coordinate.latitude, 44.9778);
  assert.equal(places[0].coordinate.longitude, -93.265);
  assert.equal(places[0].category, "karaoke");
  assert.equal(
    places[0].address,
    "100 Main St, Minneapolis, Minnesota 55401",
  );
});

test("uses Mapbox suggest and retrieve as one managed search session", async () => {
  const requestUrls: URL[] = [];
  const provider = new MapboxSearchBoxProvider({
    accessToken: "pk.test.mapbox-search-token",
    fetcher: async (input) => {
      const url = new URL(String(input));
      requestUrls.push(url);
      if (url.pathname.endsWith("/suggest")) {
        return Response.json({
          suggestions: [
            {
              mapbox_id: "poi.current-karaoke",
              name: "Current Karaoke",
              feature_type: "poi",
              place_formatted: "Minneapolis, Minnesota",
            },
          ],
        });
      }
      return Response.json({
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-93.265, 44.9778] },
            properties: {
              mapbox_id: "poi.current-karaoke",
              name: "Current Karaoke",
              feature_type: "poi",
              place_formatted: "Minneapolis, Minnesota",
            },
          },
        ],
      });
    },
  });

  const sessionToken = "11111111-1111-4111-8111-111111111111";
  const suggestions = await provider.search(
    "Current Karaoke",
    { latitude: 44.9778, longitude: -93.265 },
    { sessionToken },
  );
  const place = await provider.retrieve(suggestions[0].id, { sessionToken });

  assert.equal(place.coordinate.latitude, 44.9778);
  assert.equal(requestUrls.length, 2);
  assert.equal(requestUrls[0].searchParams.get("session_token"), sessionToken);
  assert.equal(requestUrls[1].searchParams.get("session_token"), sessionToken);
  assert.equal(requestUrls[0].searchParams.get("proximity"), "-93.265,44.9778");
});

test("managed geocoding fails closed and does not expose its token", async () => {
  const token = "pk.test.secret-mapbox-token";
  const configured = createConfiguredGeocodingProvider({
    NODE_ENV: "test",
    GEOCODING_PROVIDER: "mapbox-managed",
    MAPBOX_ACCESS_TOKEN: token,
  });

  assert.equal(configured.metadata.id, "mapbox-search-box");
  assert.equal(configured.metadata.mode, "managed");
  assert.equal(JSON.stringify(configured.metadata).includes(token), false);
  assert.throws(
    () =>
      createConfiguredGeocodingProvider({
        NODE_ENV: "test",
        GEOCODING_PROVIDER: "mapbox-managed",
      }),
    /valid Mapbox access token/,
  );

  const unavailable = new MapboxSearchBoxProvider({
    accessToken: token,
    fetcher: async () => {
      throw new Error(`network failure ${token}`);
    },
  });
  await assert.rejects(
    () =>
      unavailable.search("karaoke", undefined, {
        sessionToken: "22222222-2222-4222-8222-222222222222",
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "Managed geocoding is unavailable." &&
      !error.message.includes(token),
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
