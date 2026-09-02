"use client";

import { useEffect, useRef } from "react";
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type Map,
  type MapMouseEvent,
} from "maplibre-gl";
import type { FeatureCollection, LineString, MultiPolygon, Polygon } from "geojson";
import type { Coordinate, LineStringGeometry } from "@/lib/geo/types";
import { MINNEAPOLIS_CENTER } from "@/lib/geo/types";
import type { ShadeAnalysisResult } from "@/lib/environment/shade/types";
import type { WindAnalysisResult } from "@/lib/environment/wind/types";
import type { RainAnalysisResult } from "@/lib/environment/rain/types";
import type { HeatAnalysisResult } from "@/lib/environment/heat/types";
import type { ComfortAnalysisResult } from "@/lib/comfort/types";
import { createBasemapStyle } from "@/lib/map/basemap";

type SelectionMode = "origin" | "destination";

type ComfortMapProps = {
  origin: Coordinate | null;
  destination: Coordinate | null;
  routeGeometry: LineStringGeometry | null;
  comparisonRouteGeometries?: Array<{
    id: string;
    role: "fastest" | "comfort" | "fastest-and-comfort" | "alternative";
    geometry: LineStringGeometry;
    selected: boolean;
  }>;
  shadeAnalysis?: ShadeAnalysisResult | null;
  windAnalysis?: WindAnalysisResult | null;
  rainAnalysis?: RainAnalysisResult | null;
  heatAnalysis?: HeatAnalysisResult | null;
  comfortAnalysis?: ComfortAnalysisResult | null;
  showShadeDebug?: boolean;
  showWindDebug?: boolean;
  showRainDebug?: boolean;
  showHeatDebug?: boolean;
  showComfortDebug?: boolean;
  selectionMode: SelectionMode;
  focusCoordinate?: Coordinate | null;
  onMapSelect: (coordinate: Coordinate) => void;
  onViewportCenterChange?: (coordinate: Coordinate) => void;
};

const routeSourceId = "comfortos-route";
const routeLayerId = "comfortos-route-line";
const routeHaloLayerId = "comfortos-route-halo";
const shadeBuildingsSourceId = "comfortos-debug-buildings";
const shadeShadowsSourceId = "comfortos-debug-shadows";
const shadeSegmentsSourceId = "comfortos-debug-shade-segments";
const windSegmentsSourceId = "comfortos-debug-wind-segments";
const windVectorsSourceId = "comfortos-debug-wind-vectors";
const rainSegmentsSourceId = "comfortos-debug-rain-segments";
const heatSegmentsSourceId = "comfortos-debug-heat-segments";
const comfortSegmentsSourceId = "comfortos-debug-comfort-segments";
const emptyPolygonCollection: FeatureCollection<Polygon | MultiPolygon> = {
  type: "FeatureCollection",
  features: [],
};
const emptyLineCollection: FeatureCollection<LineString> = {
  type: "FeatureCollection",
  features: [],
};
const mapStyle = createBasemapStyle({
  provider: process.env.NEXT_PUBLIC_BASEMAP_PROVIDER,
  tileUrlTemplate: process.env.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE,
  attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION,
});

export function ComfortMap({
  origin,
  destination,
  routeGeometry,
  comparisonRouteGeometries = [],
  shadeAnalysis,
  windAnalysis,
  rainAnalysis,
  heatAnalysis,
  comfortAnalysis,
  showShadeDebug = false,
  showWindDebug = false,
  showRainDebug = false,
  showHeatDebug = false,
  showComfortDebug = false,
  selectionMode,
  focusCoordinate,
  onMapSelect,
  onViewportCenterChange,
}: ComfortMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const originMarkerRef = useRef<Marker | null>(null);
  const destinationMarkerRef = useRef<Marker | null>(null);
  const onMapSelectRef = useRef(onMapSelect);
  const onViewportCenterChangeRef = useRef(onViewportCenterChange);

  useEffect(() => {
    onMapSelectRef.current = onMapSelect;
  }, [onMapSelect]);

  useEffect(() => {
    onViewportCenterChangeRef.current = onViewportCenterChange;
  }, [onViewportCenterChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapStyle,
      center: [MINNEAPOLIS_CENTER.longitude, MINNEAPOLIS_CENTER.latitude],
      zoom: 13.4,
      attributionControl: false,
    });

    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-left");
    map.on("click", (event: MapMouseEvent) => {
      onMapSelectRef.current({
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
      });
    });
    const reportViewportCenter = () => {
      const center = map.getCenter();
      onViewportCenterChangeRef.current?.({
        latitude: center.lat,
        longitude: center.lng,
      });
    };
    map.on("moveend", reportViewportCenter);
    reportViewportCenter();

    mapRef.current = map;

    return () => {
      map.off("moveend", reportViewportCenter);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    updateMarker(originMarkerRef, map, origin, "origin");
    updateMarker(destinationMarkerRef, map, destination, "destination");
  }, [origin, destination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawRoute = () => {
      const existingSource = map.getSource(routeSourceId) as GeoJSONSource | undefined;
      const comparisonFeatures = comparisonRouteGeometries.map((route) => ({
        type: "Feature" as const,
        properties: {
          id: route.id,
          role: route.role,
          selected: route.selected,
        },
        geometry: route.geometry,
      }));
      const data = {
        type: "FeatureCollection" as const,
        features: comparisonFeatures.length
          ? comparisonFeatures
          : routeGeometry
          ? [
              {
                type: "Feature" as const,
                properties: { selected: true, role: "fastest-and-comfort" },
                geometry: routeGeometry,
              },
            ]
          : [],
      };

      if (!existingSource) {
        map.addSource(routeSourceId, {
          type: "geojson",
          data,
        });
        map.addLayer({
          id: routeHaloLayerId,
          type: "line",
          source: routeSourceId,
          paint: {
            "line-color": [
              "case",
              ["boolean", ["get", "selected"], false],
              "#4F8B85",
              "#6f756f",
            ],
            "line-width": [
              "case",
              ["boolean", ["get", "selected"], false],
              14,
              8,
            ],
            "line-opacity": [
              "case",
              ["boolean", ["get", "selected"], false],
              0.22,
              0.16,
            ],
            "line-blur": 4,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });
        map.addLayer({
          id: routeLayerId,
          type: "line",
          source: routeSourceId,
          paint: {
            "line-color": [
              "case",
              ["boolean", ["get", "selected"], false],
              "#4F8B85",
              "#6f756f",
            ],
            "line-width": [
              "case",
              ["boolean", ["get", "selected"], false],
              6,
              4,
            ],
            "line-opacity": [
              "case",
              ["boolean", ["get", "selected"], false],
              1,
              0.72,
            ],
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });
      } else {
        existingSource.setData(data);
      }

      const boundsGeometry =
        routeGeometry ??
        comparisonRouteGeometries.find((candidate) => candidate.selected)?.geometry ??
        comparisonRouteGeometries[0]?.geometry ??
        null;

      if (boundsGeometry) {
        const bounds = boundsGeometry.coordinates.reduce(
          (currentBounds, coordinate) => currentBounds.extend(coordinate),
          new LngLatBounds(
            boundsGeometry.coordinates[0],
            boundsGeometry.coordinates[0],
          ),
        );
        map.fitBounds(bounds as LngLatBoundsLike, {
          padding: { top: 96, right: 56, bottom: 330, left: 56 },
          duration: 700,
          maxZoom: 16,
        });
      }
    };

    if (map.isStyleLoaded()) {
      drawRoute();
    } else {
      map.once("load", drawRoute);
    }
  }, [comparisonRouteGeometries, routeGeometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawShadeDebug = () => {
      const buildingData =
        showShadeDebug && shadeAnalysis?.debug?.buildings
          ? shadeAnalysis.debug.buildings
          : emptyPolygonCollection;
      const shadowData =
        showShadeDebug && shadeAnalysis?.debug?.shadows
          ? shadeAnalysis.debug.shadows
          : emptyPolygonCollection;
      const segmentData =
        showShadeDebug && shadeAnalysis?.debug?.segments
          ? shadeAnalysis.debug.segments
          : emptyLineCollection;

      upsertGeoJsonSource(map, shadeBuildingsSourceId, buildingData);
      upsertGeoJsonSource(map, shadeShadowsSourceId, shadowData);
      upsertGeoJsonSource(map, shadeSegmentsSourceId, segmentData);

      if (!map.getLayer("comfortos-debug-building-fill")) {
        map.addLayer({
          id: "comfortos-debug-building-fill",
          type: "fill",
          source: shadeBuildingsSourceId,
          paint: {
            "fill-color": "#14181c",
            "fill-opacity": 0.18,
          },
        });
      }

      if (!map.getLayer("comfortos-debug-building-outline")) {
        map.addLayer({
          id: "comfortos-debug-building-outline",
          type: "line",
          source: shadeBuildingsSourceId,
          paint: {
            "line-color": "#14181c",
            "line-width": 1,
            "line-opacity": 0.45,
          },
        });
      }

      if (!map.getLayer("comfortos-debug-shadow-fill")) {
        map.addLayer({
          id: "comfortos-debug-shadow-fill",
          type: "fill",
          source: shadeShadowsSourceId,
          paint: {
            "fill-color": "#2f5f8f",
            "fill-opacity": 0.24,
          },
        });
      }

      if (!map.getLayer("comfortos-debug-segment-line")) {
        map.addLayer({
          id: "comfortos-debug-segment-line",
          type: "line",
          source: shadeSegmentsSourceId,
          paint: {
            "line-color": [
              "interpolate",
              ["linear"],
              ["get", "shadeRatio"],
              0,
              "#d97757",
              1,
              "#4f8b85",
            ],
            "line-width": 8,
            "line-opacity": 0.86,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      drawShadeDebug();
    } else {
      map.once("load", drawShadeDebug);
    }
  }, [shadeAnalysis, showShadeDebug]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawWindDebug = () => {
      const segmentData =
        showWindDebug && windAnalysis?.debug?.segments
          ? windAnalysis.debug.segments
          : emptyLineCollection;
      const vectorData =
        showWindDebug && windAnalysis?.debug?.windVectors
          ? windAnalysis.debug.windVectors
          : emptyLineCollection;

      upsertGeoJsonSource(map, windSegmentsSourceId, segmentData);
      upsertGeoJsonSource(map, windVectorsSourceId, vectorData);

      if (!map.getLayer("comfortos-debug-wind-segment-line")) {
        map.addLayer({
          id: "comfortos-debug-wind-segment-line",
          type: "line",
          source: windSegmentsSourceId,
          paint: {
            "line-color": [
              "interpolate",
              ["linear"],
              ["get", "estimatedExposureMps"],
              0,
              "#4f8b85",
              5,
              "#c1523a",
            ],
            "line-width": [
              "interpolate",
              ["linear"],
              ["get", "shelterFactor"],
              0,
              5,
              1,
              10,
            ],
            "line-opacity": 0.82,
            "line-dasharray": [2, 1.2],
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });
      }

      if (!map.getLayer("comfortos-debug-wind-vector-line")) {
        map.addLayer({
          id: "comfortos-debug-wind-vector-line",
          type: "line",
          source: windVectorsSourceId,
          paint: {
            "line-color": "#14181c",
            "line-width": 2,
            "line-opacity": 0.62,
            "line-dasharray": [1, 0.8],
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });
      }

      if (!map.getLayer("comfortos-debug-wind-vector-arrow")) {
        map.addLayer({
          id: "comfortos-debug-wind-vector-arrow",
          type: "symbol",
          source: windVectorsSourceId,
          layout: {
            "symbol-placement": "line",
            "symbol-spacing": 28,
            "text-field": ">",
            "text-size": 16,
            "text-allow-overlap": true,
            "text-rotation-alignment": "map",
            "text-keep-upright": false,
          },
          paint: {
            "text-color": "#14181c",
            "text-halo-color": "#f7f3ea",
            "text-halo-width": 1,
            "text-opacity": 0.72,
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      drawWindDebug();
    } else {
      map.once("load", drawWindDebug);
    }
  }, [windAnalysis, showWindDebug]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawRainDebug = () => {
      const segmentData =
        showRainDebug && rainAnalysis?.debug?.segments
          ? rainAnalysis.debug.segments
          : emptyLineCollection;

      upsertGeoJsonSource(map, rainSegmentsSourceId, segmentData);

      if (!map.getLayer("comfortos-debug-rain-segment-line")) {
        map.addLayer({
          id: "comfortos-debug-rain-segment-line",
          type: "line",
          source: rainSegmentsSourceId,
          paint: {
            "line-color": [
              "interpolate",
              ["linear"],
              ["get", "estimatedRainExposure"],
              0,
              "#4f8b85",
              0.45,
              "#4f73a7",
              1,
              "#304766",
            ],
            "line-width": [
              "interpolate",
              ["linear"],
              ["get", "coveredRatio"],
              0,
              8,
              1,
              5,
            ],
            "line-opacity": 0.82,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      drawRainDebug();
    } else {
      map.once("load", drawRainDebug);
    }
  }, [rainAnalysis, showRainDebug]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawHeatDebug = () => {
      const segmentData =
        showHeatDebug && heatAnalysis?.debug?.segments
          ? heatAnalysis.debug.segments
          : emptyLineCollection;

      upsertGeoJsonSource(map, heatSegmentsSourceId, segmentData);

      if (!map.getLayer("comfortos-debug-heat-segment-line")) {
        map.addLayer({
          id: "comfortos-debug-heat-segment-line",
          type: "line",
          source: heatSegmentsSourceId,
          paint: {
            "line-color": [
              "interpolate",
              ["linear"],
              ["get", "totalHeatExposureCost"],
              0,
              "#4f8b85",
              1.6,
              "#d2a43b",
              3.8,
              "#b84d3d",
            ],
            "line-width": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "directSunRatio"], 0],
              0,
              5,
              1,
              9,
            ],
            "line-opacity": 0.82,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      drawHeatDebug();
    } else {
      map.once("load", drawHeatDebug);
    }
  }, [heatAnalysis, showHeatDebug]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawComfortDebug = () => {
      const segmentData =
        showComfortDebug && comfortAnalysis?.debug?.segments
          ? comfortAnalysis.debug.segments
          : emptyLineCollection;

      upsertGeoJsonSource(map, comfortSegmentsSourceId, segmentData);

      if (!map.getLayer("comfortos-debug-comfort-segment-line")) {
        map.addLayer({
          id: "comfortos-debug-comfort-segment-line",
          type: "line",
          source: comfortSegmentsSourceId,
          paint: {
            "line-color": [
              "interpolate",
              ["linear"],
              ["get", "comfortCostRate"],
              0,
              "#4f8b85",
              2.5,
              "#c9a227",
              5,
              "#c1523a",
            ],
            "line-width": 8,
            "line-opacity": 0.78,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      drawComfortDebug();
    } else {
      map.once("load", drawComfortDebug);
    }
  }, [comfortAnalysis, showComfortDebug]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusCoordinate || routeGeometry) return;

    map.easeTo({
      center: [focusCoordinate.longitude, focusCoordinate.latitude],
      zoom: Math.max(map.getZoom(), 15),
      duration: 650,
    });
  }, [focusCoordinate, routeGeometry]);

  return (
    <div className="map-shell" data-selection-mode={selectionMode}>
      <div
        ref={containerRef}
        className="map-canvas"
        aria-label="Interactive ComfortOS walking map"
      />
      <div className="map-instruction" aria-live="polite">
        Tap the map to set {selectionMode === "origin" ? "an origin" : "a destination"}.
      </div>
    </div>
  );
}

function upsertGeoJsonSource(
  map: Map,
  sourceId: string,
  data: FeatureCollection<Polygon | MultiPolygon> | FeatureCollection<LineString>,
) {
  const existingSource = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (existingSource) {
    existingSource.setData(data);
    return;
  }

  map.addSource(sourceId, {
    type: "geojson",
    data,
  });
}

function updateMarker(
  markerRef: React.MutableRefObject<Marker | null>,
  map: Map,
  coordinate: Coordinate | null,
  kind: "origin" | "destination",
) {
  if (!coordinate) {
    markerRef.current?.remove();
    markerRef.current = null;
    return;
  }

  if (!markerRef.current) {
    const markerElement = document.createElement("div");
    markerElement.className = `route-marker route-marker-${kind}`;
    markerElement.setAttribute("aria-label", kind === "origin" ? "Origin" : "Destination");
    markerRef.current = new Marker({ element: markerElement, anchor: "center" })
      .setLngLat([coordinate.longitude, coordinate.latitude])
      .addTo(map);
    return;
  }

  markerRef.current.setLngLat([coordinate.longitude, coordinate.latitude]);
}
