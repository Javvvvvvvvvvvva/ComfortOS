"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Coordinate } from "@/lib/geo/types";
import type { RouteResult } from "@/lib/routing/types";
import { formatCoordinate, formatDistance, formatDuration } from "@/lib/geo/format";
import {
  requestComfortRouteComparison,
  requestFastestWalkingRoute,
} from "@/lib/routing/client";
import type { PlaceResult, PlaceSuggestion } from "@/lib/geocoding/types";
import {
  retrievePlace,
  reverseGeocode,
  searchPlaces,
} from "@/lib/geocoding/client";
import {
  messageForGeolocationStatus,
  statusFromGeolocationError,
  type GeolocationStatus,
} from "@/lib/geolocation/state";
import {
  normalizeSearchQuery,
  SEARCH_DEBOUNCE_MS,
  shouldRequestSearch,
} from "@/lib/search/searchBehavior";
import { requestWeatherBundle } from "@/lib/weather/client";
import { selectWeatherCoordinate } from "@/lib/weather/location";
import type { WeatherBundle } from "@/lib/weather/types";
import type { ShadeAnalysisResult } from "@/lib/environment/shade/types";
import type { WindAnalysisResult } from "@/lib/environment/wind/types";
import type { RainAnalysisResult } from "@/lib/environment/rain/types";
import type { HeatAnalysisResult } from "@/lib/environment/heat/types";
import type { ComfortAnalysisResult } from "@/lib/comfort/types";
import type {
  AnalyzedRouteCandidate,
  ComfortRouteComparisonResult,
} from "@/lib/comfort-routing/types";
import { EnvironmentSummary } from "./EnvironmentSummary";
import { decideRoutingContext } from "@/lib/comfort-routing/contextualMode";
import { explainComfortRoute } from "@/lib/comfort-routing/explanations";
import { createRouteEvent, type ComfortRouteEvent } from "@/lib/comfort-routing/events";

const ComfortMap = lazy(async () => {
  const loaded = await import("./ComfortMap");
  return { default: loaded.ComfortMap };
});

type SelectionMode = "origin" | "destination";
type RouteState = "idle" | "loading" | "success" | "error";
type SearchState = "idle" | "loading" | "success" | "empty" | "error";
type WeatherState = "idle" | "loading" | "success" | "error";
type ShadeState = "idle" | "loading" | "success" | "error";
type WindState = "idle" | "loading" | "success" | "error";
type RainState = "idle" | "loading" | "success" | "error";
type HeatState = "idle" | "loading" | "success" | "error";
type ComfortState = "idle" | "loading" | "success" | "error";
type ContextualRouteLabel = "Stay Warm" | "Stay Dry" | "Stay Cool" | "Comfort";
type ComfortAnalysisState =
  | { status: "idle" }
  | { status: "loading"; startedAt: string }
  | { status: "complete"; result: ComfortRouteComparisonResult }
  | { status: "limited"; reason: string; result?: ComfortRouteComparisonResult }
  | { status: "failed"; reason: string };
const COMFORT_ANALYSIS_TIMEOUT_MS = 12_000;

export function ComfortOSApp() {
  const [origin, setOrigin] = useState<PlaceResult | null>(null);
  const [destination, setDestination] = useState<PlaceResult | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("origin");
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeComparison, setRouteComparison] =
    useState<ComfortRouteComparisonResult | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [routeState, setRouteState] = useState<RouteState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<PlaceSuggestion[]>([]);
  const [searchSessionToken, setSearchSessionToken] = useState(() =>
    globalThis.crypto.randomUUID(),
  );
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [focusCoordinate, setFocusCoordinate] = useState<Coordinate | null>(null);
  const [mapViewportCenter, setMapViewportCenter] = useState<Coordinate | null>(null);
  const [currentLocationCoordinate, setCurrentLocationCoordinate] =
    useState<Coordinate | null>(null);
  const [weather, setWeather] = useState<WeatherBundle | null>(null);
  const [weatherState, setWeatherState] = useState<WeatherState>("idle");
  const [shadeAnalysis, setShadeAnalysis] = useState<ShadeAnalysisResult | null>(null);
  const [shadeState, setShadeState] = useState<ShadeState>("idle");
  const [windAnalysis, setWindAnalysis] = useState<WindAnalysisResult | null>(null);
  const [windState, setWindState] = useState<WindState>("idle");
  const [rainAnalysis, setRainAnalysis] = useState<RainAnalysisResult | null>(null);
  const [rainState, setRainState] = useState<RainState>("idle");
  const [heatAnalysis, setHeatAnalysis] = useState<HeatAnalysisResult | null>(null);
  const [heatState, setHeatState] = useState<HeatState>("idle");
  const [comfortAnalysis, setComfortAnalysis] = useState<ComfortAnalysisResult | null>(null);
  const [comfortState, setComfortState] = useState<ComfortState>("idle");
  const [comfortAnalysisState, setComfortAnalysisState] =
    useState<ComfortAnalysisState>({ status: "idle" });
  const [events, setEvents] = useState<ComfortRouteEvent[]>([]);
  const [geolocationStatus, setGeolocationStatus] =
    useState<GeolocationStatus>("idle");
  const searchRequestId = useRef(0);
  const routeRequestId = useRef(0);
  const routeAbortController = useRef<AbortController | null>(null);
  const comfortAbortController = useRef<AbortController | null>(null);

  const originCoordinate = origin?.coordinate ?? null;
  const destinationCoordinate = destination?.coordinate ?? null;
  const weatherCoordinate = selectWeatherCoordinate({
    selectedOrigin: originCoordinate,
    currentLocation: currentLocationCoordinate,
  });
  const routingContext =
    routeComparison?.debug.context ??
    decideRoutingContext(weather, { rainCapable: false, heatCapable: false });
  const debugMode =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("debug")
      : null;
  const showShadeDebug = debugMode === "shade" || debugMode === "environment";
  const showWindDebug = debugMode === "wind" || debugMode === "environment";
  const showComfortDebug = debugMode === "comfort" || debugMode === "environment";
  const showRoutingDebug = debugMode === "routing" || debugMode === "environment";
  const showRainDebug = debugMode === "rain" || debugMode === "environment";
  const showHeatDebug = debugMode === "heat" || debugMode === "environment";

  const recordEvent = useCallback((event: ComfortRouteEvent) => {
    setEvents((current) => [...current.slice(-24), event]);
  }, []);

  const resetAnalysisState = useCallback(() => {
    routeAbortController.current?.abort();
    comfortAbortController.current?.abort();
    setRoute(null);
    setRouteComparison(null);
    setSelectedCandidateId(null);
    setRouteState("idle");
    setShadeAnalysis(null);
    setShadeState("idle");
    setWindAnalysis(null);
    setWindState("idle");
    setRainAnalysis(null);
    setRainState("idle");
    setHeatAnalysis(null);
    setHeatState("idle");
    setComfortAnalysis(null);
    setComfortState("idle");
    setComfortAnalysisState({ status: "idle" });
  }, []);

  useEffect(() => {
    if (!weatherCoordinate) {
      return;
    }

    const abortController = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setWeatherState("loading");
        const weatherBundle = await requestWeatherBundle(
          weatherCoordinate,
          abortController.signal,
        );
        setWeather(weatherBundle);
        setWeatherState("success");
      } catch {
        if (abortController.signal.aborted) return;
        setWeather(null);
        setWeatherState("error");
      }
    }, 0);

    return () => {
      window.clearTimeout(timeout);
      abortController.abort();
    };
  }, [weatherCoordinate]);

  useEffect(() => {
    const normalizedQuery = normalizeSearchQuery(query);

    if (!shouldRequestSearch(normalizedQuery)) {
      return;
    }

    const requestId = searchRequestId.current + 1;
    searchRequestId.current = requestId;
    const abortController = new AbortController();

    const timeout = window.setTimeout(async () => {
      try {
        setSearchState("loading");
        setSearchError(null);
        const results = await searchPlaces(
          normalizedQuery,
          mapViewportCenter ??
            originCoordinate ??
            currentLocationCoordinate ??
            destinationCoordinate ??
            undefined,
          searchSessionToken,
          abortController.signal,
        );

        if (searchRequestId.current !== requestId) return;

        setPlaces(results);
        setSearchState(results.length > 0 ? "success" : "empty");
      } catch (searchFailure) {
        if (abortController.signal.aborted || searchRequestId.current !== requestId) {
          return;
        }

        setPlaces([]);
        setSearchState("error");
        setSearchError(
          searchFailure instanceof Error
            ? searchFailure.message
            : "Unable to search places.",
        );
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      abortController.abort();
    };
  }, [
    currentLocationCoordinate,
    destinationCoordinate,
    mapViewportCenter,
    originCoordinate,
    query,
    searchSessionToken,
  ]);

  function makeSelectedPointPlace(coordinate: Coordinate): PlaceResult {
    return {
      id: `selected:${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`,
      name: "Selected point",
      address: formatCoordinate(coordinate),
      coordinate,
      category: "map-selection",
    };
  }

  const setPlaceForMode = useCallback(
    (place: PlaceResult, mode = selectionMode) => {
      if (mode === "origin") {
        setOrigin(place);
        setSelectionMode("destination");
      } else {
        setDestination(place);
      }

      routeRequestId.current += 1;
      setFocusCoordinate(place.coordinate);
      resetAnalysisState();
      setError(null);
    },
    [resetAnalysisState, selectionMode],
  );

  const handleMapSelect = useCallback(
    (coordinate: Coordinate) => {
      const modeAtSelection = selectionMode;
      setPlaceForMode(makeSelectedPointPlace(coordinate), modeAtSelection);

      const abortController = new AbortController();
      reverseGeocode(coordinate, abortController.signal)
        .then((place) => {
          if (place) setPlaceForMode(place, modeAtSelection);
        })
        .catch(() => {
          // Map selection is already usable with raw coordinates.
        });
    },
    [selectionMode, setPlaceForMode],
  );

  const canRoute = Boolean(originCoordinate && destinationCoordinate);

  async function calculateRoute() {
    if (!originCoordinate) {
      setError("Choose an origin first.");
      setRouteState("error");
      return;
    }

    if (!destinationCoordinate) {
      setError("Choose a destination first.");
      setRouteState("error");
      return;
    }

    setRouteState("loading");
    setError(null);
    const requestId = routeRequestId.current + 1;
    routeRequestId.current = requestId;
    routeAbortController.current?.abort();
    comfortAbortController.current?.abort();
    const fastestController = new AbortController();
    routeAbortController.current = fastestController;
    recordEvent(createRouteEvent("route_requested"));

    try {
      const departureTime = new Date().toISOString();
      setRouteComparison(null);
      setSelectedCandidateId(null);
      setShadeAnalysis(null);
      setShadeState("idle");
      setWindAnalysis(null);
      setWindState("idle");
      setRainAnalysis(null);
      setRainState("idle");
      setHeatAnalysis(null);
      setHeatState("idle");
      setComfortAnalysis(null);
      setComfortState("idle");
      setComfortAnalysisState({ status: "idle" });

      const fastestRoute = await requestFastestWalkingRoute({
        origin: originCoordinate,
        destination: destinationCoordinate,
        departureTime,
      }, fastestController.signal);
      if (routeRequestId.current !== requestId) return;
      routeAbortController.current = null;

      setRoute(fastestRoute);
      setRouteState("success");
      setSelectedCandidateId("fastest-pending");
      recordEvent(createRouteEvent("fastest_ready"));

      const comfortController = new AbortController();
      comfortAbortController.current = comfortController;
      setComfortAnalysisState({ status: "loading", startedAt: new Date().toISOString() });
      setShadeState("loading");
      setWindState("loading");
      setRainState("loading");
      setHeatState("loading");
      setComfortState("loading");
      recordEvent(createRouteEvent("comfort_analysis_started"));
      const comfortTimeout = window.setTimeout(() => {
        comfortController.abort();
        if (routeRequestId.current !== requestId) return;
        setShadeState("error");
        setWindState("error");
        setRainState("error");
        setHeatState("error");
        setComfortState("error");
        setComfortAnalysisState({
          status: "failed",
          reason: "Comfort analysis is taking longer than expected.",
        });
      }, COMFORT_ANALYSIS_TIMEOUT_MS);

      requestComfortRouteComparison({
        origin: originCoordinate,
        destination: destinationCoordinate,
        departureTime,
        weatherCoordinate: weatherCoordinate ?? undefined,
        weatherBundle: weather ?? undefined,
        generationMode: "enhanced",
        generationPolicy: {
          maxCandidateAttempts: 4,
          maxConcurrentCandidateRequests: 3,
          maxEnvironmentAnalyzedCandidates: 5,
        },
        includeEnvironmentalDebug:
          showShadeDebug ||
          showWindDebug ||
          showComfortDebug ||
          showRainDebug ||
          showHeatDebug,
      }, comfortController.signal)
        .then((comparison) => {
          window.clearTimeout(comfortTimeout);
          if (
            routeRequestId.current !== requestId ||
            comfortController.signal.aborted
          ) {
            return;
          }

          const selectedCandidate = comparison.comfort;
          const selectedId =
            comparison.fastest.id === comparison.comfort.id
              ? comparison.fastest.id
              : selectedCandidate.id;
          setRouteComparison(comparison);
          setSelectedCandidateId(selectedId);
          setRoute(selectedCandidate.route);
          applyCandidateEnvironmentalAnalysis(selectedCandidate);

          if (!hasComparableComfort(comparison)) {
            setComfortAnalysisState({
              status: "limited",
              reason: "Limited environmental data.",
              result: comparison,
            });
            recordEvent(createRouteEvent("comfort_analysis_limited"));
            return;
          }

          setComfortAnalysisState({ status: "complete", result: comparison });
          recordEvent(createRouteEvent("comfort_analysis_completed"));
          recordEvent(
            createRouteEvent(
              comparison.fastest.id === comparison.comfort.id
                ? "comfort_route_same"
                : "comfort_route_different",
            ),
          );
        })
        .catch((comfortError) => {
          window.clearTimeout(comfortTimeout);
          if (
            routeRequestId.current !== requestId ||
            comfortController.signal.aborted
          ) {
            return;
          }
          setShadeState("error");
          setWindState("error");
          setRainState("error");
          setHeatState("error");
          setComfortState("error");
          setComfortAnalysisState({
            status: "failed",
            reason:
              comfortError instanceof Error
                ? comfortError.message
                : "Comfort analysis unavailable.",
          });
        });
    } catch (routeError) {
      if (routeRequestId.current !== requestId || fastestController.signal.aborted) return;
      routeAbortController.current = null;
      setRoute(null);
      setRouteComparison(null);
      setSelectedCandidateId(null);
      setShadeAnalysis(null);
      setShadeState("idle");
      setWindAnalysis(null);
      setWindState("idle");
      setComfortAnalysis(null);
      setComfortState("idle");
      setComfortAnalysisState({ status: "idle" });
      setError(
        routeError instanceof Error
          ? routeError.message
          : "Unable to calculate a walking route.",
      );
      setRouteState("error");
    }
  }

  function clearRoute() {
    routeRequestId.current += 1;
    comfortAbortController.current?.abort();
    setOrigin(null);
    setDestination(null);
    if (!currentLocationCoordinate) {
      setWeather(null);
      setWeatherState("idle");
    }
    resetAnalysisState();
    setSelectionMode("origin");
    setError(null);
  }

  async function selectSearchResult(suggestion: PlaceSuggestion) {
    try {
      setSearchState("loading");
      setSearchError(null);
      const place = suggestion.coordinate
        ? { ...suggestion, coordinate: suggestion.coordinate }
        : await retrievePlace(suggestion.id, searchSessionToken);

      setPlaceForMode(place);
      setQuery("");
      setPlaces([]);
      setSearchSessionToken(globalThis.crypto.randomUUID());
      setSearchState("idle");
    } catch (searchFailure) {
      setSearchState("error");
      setSearchError(
        searchFailure instanceof Error
          ? searchFailure.message
          : "Unable to load the selected place.",
      );
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value);

    if (!shouldRequestSearch(value)) {
      setPlaces([]);
      setSearchState("idle");
      setSearchError(null);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setGeolocationStatus("unavailable");
      return;
    }

    setGeolocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinate = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        const currentLocation: PlaceResult = {
          id: `current:${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`,
          name: "Current location",
          address: formatCoordinate(coordinate),
          coordinate,
          category: "current-location",
        };

        setCurrentLocationCoordinate(coordinate);
        routeRequestId.current += 1;
        setOrigin(currentLocation);
        setSelectionMode("destination");
        setFocusCoordinate(coordinate);
        resetAnalysisState();
        setError(null);
        setGeolocationStatus("granted");

        reverseGeocode(coordinate)
          .then((place) => {
            if (place) {
              setOrigin({
                ...place,
                name: "Current location",
              });
            }
          })
          .catch(() => {
            // Current location remains selected even when reverse lookup fails.
          });
      },
      (geoError) => {
        setGeolocationStatus(statusFromGeolocationError(geoError));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }

  const geolocationMessage = messageForGeolocationStatus(geolocationStatus);
  const activePointLabel = selectionMode === "origin" ? "origin" : "destination";
  const comparisonRouteGeometries =
    routeComparison?.candidates
      .filter((candidate) => candidate.role !== "alternative")
      .map((candidate) => ({
        id: candidate.id,
        role: candidate.role,
        geometry: candidate.route.geometry,
        selected: candidate.id === selectedCandidateId,
      })) ?? [];

  function selectRouteCandidate(candidateId: string) {
    const candidate = routeComparison?.candidates.find((value) => value.id === candidateId);
    if (!candidate) return;

    setSelectedCandidateId(candidate.id);
    setRoute(candidate.route);
    applyCandidateEnvironmentalAnalysis(candidate);
    recordEvent(createRouteEvent("route_selected", { role: candidate.role }));
  }

  function applyCandidateEnvironmentalAnalysis(candidate: AnalyzedRouteCandidate) {
    setShadeAnalysis(candidate.shadeAnalysis ?? null);
    setShadeState(candidate.shadeAnalysis ? "success" : "error");
    setWindAnalysis(candidate.windAnalysis ?? null);
    setWindState(candidate.windAnalysis ? "success" : "error");
    setRainAnalysis(candidate.rainAnalysis ?? null);
    setRainState(candidate.rainAnalysis ? "success" : "error");
    setHeatAnalysis(candidate.heatAnalysis ?? null);
    setHeatState(candidate.heatAnalysis ? "success" : "error");
    setComfortAnalysis(candidate.comfortAnalysis ?? null);
    setComfortState(candidate.comfortAnalysis ? "success" : "error");
  }

  return (
    <main className="app-shell">
      <Suspense
        fallback={<div className="map-shell map-loading" role="status" aria-label="Loading map" />}
      >
        <ComfortMap
          origin={originCoordinate}
          destination={destinationCoordinate}
          routeGeometry={route?.geometry ?? null}
          comparisonRouteGeometries={comparisonRouteGeometries}
          shadeAnalysis={shadeAnalysis}
          windAnalysis={windAnalysis}
          rainAnalysis={rainAnalysis}
          heatAnalysis={heatAnalysis}
          comfortAnalysis={comfortAnalysis}
          showShadeDebug={showShadeDebug}
          showWindDebug={showWindDebug}
          showRainDebug={showRainDebug}
          showHeatDebug={showHeatDebug}
          showComfortDebug={showComfortDebug}
          selectionMode={selectionMode}
          focusCoordinate={focusCoordinate}
          onMapSelect={handleMapSelect}
          onViewportCenterChange={setMapViewportCenter}
        />
      </Suspense>

      <section className="top-chrome" aria-label="Current map context">
        <div className="top-title">
          <p className="eyebrow">Outdoor comfort navigation</p>
          <h1>ComfortOS</h1>
        </div>
        <EnvironmentSummary weather={weather} state={weatherState} />
      </section>

      <section className="bottom-sheet" aria-label="Walking route controls">
        <div className="sheet-handle" aria-hidden="true" />

        <label className="search-label" htmlFor="place-search">
          Where are you going?
        </label>
        <div className="search-row">
          <input
            id="place-search"
            type="search"
            value={query}
            placeholder={`Search ${activePointLabel}`}
            autoComplete="off"
            onChange={(event) => handleQueryChange(event.target.value)}
            aria-controls="place-results"
          />
          <button
            type="button"
            className="location-action"
            onClick={useCurrentLocation}
            disabled={geolocationStatus === "requesting"}
          >
            {geolocationStatus === "requesting" ? "Locating" : "Use my location"}
          </button>
        </div>

        <div className="search-feedback" aria-live="polite">
          {searchState === "loading" ? "Searching..." : null}
          {searchState === "empty" ? "No places found." : null}
          {searchState === "error" ? searchError : null}
          {geolocationMessage ? geolocationMessage : null}
        </div>

        {weather?.alerts[0] ? (
          <div className="weather-alert" role="alert" aria-live="assertive">
            <span className="eyebrow">Official weather alert</span>
            <strong>{weather.alerts[0].event}</strong>
            <span>{weather.alerts[0].headline ?? "Active NWS alert."}</span>
          </div>
        ) : null}

        {places.length > 0 ? (
          <div id="place-results" className="place-results" role="listbox">
            {places.map((place) => (
              <button
                key={place.id}
                type="button"
                className="place-result"
                role="option"
                aria-selected="false"
                onClick={() => void selectSearchResult(place)}
              >
                <span>{place.name}</span>
                <small>
                  {place.address ??
                    place.category ??
                    (place.coordinate ? formatCoordinate(place.coordinate) : "Place")}
                </small>
              </button>
            ))}
          </div>
        ) : null}

        <div className="selection-tabs" role="radiogroup" aria-label="Map tap target">
          <button
            type="button"
            className={selectionMode === "origin" ? "active" : ""}
            aria-pressed={selectionMode === "origin"}
            onClick={() => setSelectionMode("origin")}
          >
            Origin
          </button>
          <button
            type="button"
            className={selectionMode === "destination" ? "active" : ""}
            aria-pressed={selectionMode === "destination"}
            onClick={() => setSelectionMode("destination")}
          >
            Destination
          </button>
        </div>

        <div className="point-grid">
          <div className="point-row">
            <span className="point-dot origin-dot" aria-hidden="true" />
            <div>
              <p>Origin</p>
              <strong>{origin?.name ?? "Not selected"}</strong>
              {origin ? <small>{origin.address ?? formatCoordinate(origin.coordinate)}</small> : null}
            </div>
          </div>
          <div className="point-row">
            <span className="point-dot destination-dot" aria-hidden="true" />
            <div>
              <p>Destination</p>
              <strong>{destination?.name ?? "Not selected"}</strong>
              {destination ? (
                <small>{destination.address ?? formatCoordinate(destination.coordinate)}</small>
              ) : null}
            </div>
          </div>
        </div>

        {route ? (
          <div className="route-options" aria-label="Route comparison">
            {routeComparison ? (
              <ComfortRouteCards
                comparison={routeComparison}
                selectedCandidateId={selectedCandidateId}
                contextualRouteLabel={routingContext.routeLabel}
                onSelect={selectRouteCandidate}
              />
            ) : (
              <button
                type="button"
                className="route-option selected"
                aria-pressed="true"
              >
                <span className="route-option-main">
                  <span>
                    <span className="eyebrow route-eyebrow">Fastest</span>
                    <strong>{formatDuration(route.durationSeconds)}</strong>
                  </span>
                  <span>{formatDistance(route.distanceMeters)}</span>
                </span>
                <span className="route-note-inline">
                  Standard walking route is ready.
                </span>
              </button>
            )}

            <ComfortProgressPanel
              state={comfortAnalysisState}
              contextReason={routingContext.reason}
              contextualRouteLabel={routingContext.routeLabel}
              fastest={routeComparison?.fastest ?? null}
              comfort={routeComparison?.comfort ?? null}
              weatherState={weatherState}
            />
          </div>
        ) : (
          <div className="route-card" aria-live="polite">
            <div className="route-card-head">
              <div>
                <p className="eyebrow route-eyebrow">Fastest</p>
                <h2>Set two points</h2>
              </div>
            </div>

            <p className="route-note">
              Search, use current location, or tap the map to set both points.
            </p>
          </div>
        )}

        {route ? (
          <p className="environment-disclaimer" role="note">
            Outdoor conditions are estimates and can change. Official weather alerts take priority.
          </p>
        ) : null}

        <nav className="product-links" aria-label="Privacy, terms, data sources, and support">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/data-sources">Data</Link>
          <Link href="/support">Support</Link>
        </nav>

        {showRoutingDebug && routeComparison ? (
          <div className="shade-estimate">
            <p className="eyebrow">Routing debug</p>
            <strong>
              {routeComparison.debug.generation?.environmentAnalyzedCandidates ??
                routeComparison.candidates.length}{" "}
              candidate(s) analyzed
            </strong>
            {routeComparison.debug.generation ? (
              <small>
                generated {routeComparison.debug.generation.generatedCandidates} · deduped{" "}
                {routeComparison.debug.generation.deduplicatedCandidates} · detour rejected{" "}
                {routeComparison.debug.generation.detourFilteredCandidates} · diversity rejected{" "}
                {routeComparison.debug.generation.diversityFilteredCandidates}
              </small>
            ) : null}
            {routeComparison.debug.routingProvider ? (
              <small>
                Routing {routeComparison.debug.routingProvider.name} /{" "}
                {routeComparison.debug.routingProvider.mode} · profile{" "}
                {routeComparison.debug.routingProvider.profile} · endpoint{" "}
                {routeComparison.debug.routingProvider.endpointFamily}
              </small>
            ) : null}
            {weather ? <small>Weather {weather.source}</small> : null}
            {routeComparison.debug.buildings ? (
              <small>
                buildings source {routeComparison.debug.buildings.provider ?? "unknown"} · mode{" "}
                {routeComparison.debug.buildings.providerMode} · dataset{" "}
                {routeComparison.debug.buildings.datasetVersion ?? "unknown"} · region{" "}
                {routeComparison.debug.buildings.region ?? "unknown"} · loaded{" "}
                {routeComparison.debug.buildings.loadedBuildings} · explicit{" "}
                {routeComparison.debug.buildings.explicitHeightBuildings} · floors{" "}
                {routeComparison.debug.buildings.floorDerivedHeightBuildings} · unknown{" "}
                {routeComparison.debug.buildings.unknownHeightBuildings} · query{" "}
                {formatBoolean(routeComparison.debug.buildings.querySucceeded)}
              </small>
            ) : null}
            {routeComparison.debug.coveredFeatures ? (
              <small>
                cover source {routeComparison.debug.coveredFeatures.provider ?? "unknown"} · mode{" "}
                {routeComparison.debug.coveredFeatures.providerMode} · region{" "}
                {routeComparison.debug.coveredFeatures.region ?? "unknown"} · features{" "}
                {routeComparison.debug.coveredFeatures.loadedFeatures} · eligible{" "}
                {routeComparison.debug.coveredFeatures.eligibleFeatures ?? "n/a"} · restricted{" "}
                {routeComparison.debug.coveredFeatures.restrictedFeatures ?? "n/a"} · quality{" "}
                {Math.round(
                  (routeComparison.debug.coveredFeatures.rainCoverCoverageQuality ?? 0) * 100,
                )}
                % · query{" "}
                {formatBoolean(routeComparison.debug.coveredFeatures.querySucceeded)}
              </small>
            ) : null}
            {routeComparison.debug.context ? (
              <small>
                context {routeComparison.debug.context.context} · profile{" "}
                {routeComparison.debug.context.profile} · rain capable{" "}
                {formatBoolean(routeComparison.debug.context.rainCapable)} · rain severity{" "}
                {routeComparison.debug.context.rainSeverity.toFixed(2)} · cold severity{" "}
                {routeComparison.debug.context.coldSeverity.toFixed(2)} · heat capable{" "}
                {formatBoolean(routeComparison.debug.context.heatCapable)} · heat severity{" "}
                {routeComparison.debug.context.heatSeverity.toFixed(2)}
              </small>
            ) : null}
            {routeComparison.debug.performanceMs ? (
              <small>
                Fastest {formatMilliseconds(routeComparison.debug.performanceMs.fastestRoute)} ·
                candidate routing{" "}
                {formatMilliseconds(routeComparison.debug.performanceMs.candidateGeneration)} ·
                environment{" "}
                {formatMilliseconds(routeComparison.debug.performanceMs.candidateAnalysis)} ·
                Comfort total {formatMilliseconds(routeComparison.debug.performanceMs.total)}
              </small>
            ) : null}
            {routeComparison.debug.routingUsage ? (
              <small>
                managed requests {routeComparison.debug.routingUsage.totalRequests} · Fastest{" "}
                {routeComparison.debug.routingUsage.fastestRequests} · candidates{" "}
                {routeComparison.debug.routingUsage.candidateRequests} · failed{" "}
                {routeComparison.debug.routingUsage.failedRequests}
              </small>
            ) : null}
            {events.length > 0 ? (
              <small>
                events {events.slice(-6).map((event) => event.name).join(" · ")}
              </small>
            ) : null}
            <div className="shade-debug-grid">
              {routeComparison.debug.candidates.map((candidate) => (
                <small key={candidate.id}>
                  {candidate.id} · {candidate.generator} · {candidate.selectedRole} ·{" "}
                  {formatDuration(candidate.durationSeconds)} ·{" "}
                  {formatDistance(candidate.distanceMeters)} · overlap{" "}
                  {Math.round(candidate.overlapWithFastest * 100)}% · unique{" "}
                  {Math.round(candidate.uniqueMeters)} m · lateral{" "}
                  {Math.round(candidate.maxLateralSeparationMeters)} m · raw{" "}
                  {candidate.rawEnvironmentalCost === null
                    ? "n/a"
                    : candidate.rawEnvironmentalCost.toFixed(1)}
                  {" · "}score {candidate.comfortScore ?? "Limited data"} · confidence{" "}
                  {Math.round(candidate.confidence * 100)}% · completeness{" "}
                  {Math.round(candidate.completeness * 100)}% · comparable{" "}
                  {formatBoolean(candidate.comparable)} · detour{" "}
                  {formatBoolean(candidate.detourEligible)}
                  {" · "}rain{" "}
                  {candidate.rainExposure === null ? "n/a" : candidate.rainExposure.toFixed(2)}
                  {" · "}heat{" "}
                  {candidate.heatExposure === null ? "n/a" : candidate.heatExposure.toFixed(2)}
                  {" · "}direct sun{" "}
                  {candidate.directSunRatio === null
                    ? "n/a"
                    : `${Math.round(candidate.directSunRatio * 100)}%`}
                  {" · "}sun run{" "}
                  {candidate.longestContinuousSunMeters === null
                    ? "n/a"
                    : `${Math.round(candidate.longestContinuousSunMeters)} m`}
                  {" · "}covered{" "}
                  {candidate.coveredMeters === null ? "n/a" : `${Math.round(candidate.coveredMeters)} m`}
                  {" · "}cover ratio{" "}
                  {candidate.coveredRatio === null
                    ? "n/a"
                    : `${Math.round(candidate.coveredRatio * 100)}%`}
                  {" · "}longest run{" "}
                  {candidate.longestContinuousCoveredMeters === null
                    ? "n/a"
                    : `${Math.round(candidate.longestContinuousCoveredMeters)} m`}
                  {candidate.waypoint
                    ? ` · waypoint ${formatCoordinate(candidate.waypoint)}`
                    : ""}
                </small>
              ))}
            </div>
          </div>
        ) : null}

        {route ? (
          <div className="shade-estimate" aria-live="polite">
            <p className="eyebrow">Heat exposure</p>
            {heatState === "loading" ? <strong>Estimating heat exposure...</strong> : null}
            {heatState === "error" ? <strong>Heat exposure unavailable</strong> : null}
            {heatAnalysis && heatState === "success" ? (
              <>
                <strong>{formatHeatExposureLabel(heatAnalysis.summary.averageHeatExposure)}</strong>
                <span>
                  direct sun {Math.round(heatAnalysis.summary.directSunRatio * 100)}% · estimated
                  building shade {Math.round(heatAnalysis.summary.shadeRatio * 100)}% · confidence{" "}
                  {Math.round(heatAnalysis.summary.confidence * 100)}%
                </span>
                {showHeatDebug ? (
                  <div className="shade-debug-grid">
                    <small>
                      analyzed {Math.round(heatAnalysis.summary.analyzedMeters)} m · unknown{" "}
                      {Math.round(heatAnalysis.summary.unknownMeters)} m · completeness{" "}
                      {Math.round(heatAnalysis.summary.completeness * 100)}%
                    </small>
                    <small>
                      ambient {heatAnalysis.summary.ambientHeatExposure.toFixed(2)} · solar{" "}
                      {heatAnalysis.summary.solarExposure.toFixed(2)} · ventilation{" "}
                      {heatAnalysis.summary.ventilationModifier.toFixed(2)}
                    </small>
                    <small>
                      longest sunny stretch{" "}
                      {Math.round(heatAnalysis.summary.longestContinuousSunMeters)} m ·{" "}
                      {Math.round(heatAnalysis.summary.longestContinuousSunSeconds)} s · runs{" "}
                      {heatAnalysis.summary.sunnyRunCount}
                    </small>
                    <small>segment sample: {formatHeatSegmentDebug(heatAnalysis)}</small>
                  </div>
                ) : null}
              </>
            ) : null}
            {showHeatDebug ? <small>Debug layer: heat exposure route segments</small> : null}
          </div>
        ) : null}

        {route ? (
          <div className="shade-estimate" aria-live="polite">
            <p className="eyebrow">Rain exposure</p>
            {rainState === "loading" ? <strong>Estimating rain exposure...</strong> : null}
            {rainState === "error" ? <strong>Rain exposure unavailable</strong> : null}
            {rainAnalysis && rainState === "success" ? (
              <>
                <strong>{formatRainExposureLabel(rainAnalysis.summary.averageRainExposure)}</strong>
                <span>
                  {Math.round(rainAnalysis.summary.exposedMeters)} m exposed ·{" "}
                  {Math.round(rainAnalysis.summary.coveredMeters)} m covered · confidence{" "}
                  {Math.round(rainAnalysis.summary.confidence * 100)}%
                </span>
                {showRainDebug ? (
                  <div className="shade-debug-grid">
                    <small>
                      precipitation{" "}
                      {formatNullableNumber(
                        rainAnalysis.segmentRain[0]?.precipitationIntensityMmPerHour,
                        " mm/h",
                      )}{" "}
                      · probability{" "}
                      {formatNullableNumber(
                        rainAnalysis.segmentRain[0]?.precipitationProbability,
                        "%",
                      )}
                    </small>
                    <small>
                      exposed {Math.round(rainAnalysis.summary.exposedMeters)} m · covered{" "}
                      {Math.round(rainAnalysis.summary.coveredMeters)} m · unknown{" "}
                      {Math.round(rainAnalysis.summary.unknownMeters)} m
                    </small>
                    <small>
                      longest covered run{" "}
                      {Math.round(rainAnalysis.summary.longestContinuousCoveredMeters)} m · runs{" "}
                      {rainAnalysis.summary.coveredSegmentCount} · avg run{" "}
                      {Math.round(rainAnalysis.summary.averageCoveredRunLength)} m
                    </small>
                    <small>
                      wind-driven modifier{" "}
                      {(rainAnalysis.segmentRain[0]?.windDrivenExposureFactor ?? 1).toFixed(2)}
                    </small>
                    <small>
                      segment sample: {formatRainSegmentDebug(rainAnalysis)}
                    </small>
                  </div>
                ) : null}
              </>
            ) : null}
            {showRainDebug ? <small>Debug layer: rain exposure route segments</small> : null}
          </div>
        ) : null}

        {route ? (
          <div className="shade-estimate" aria-live="polite">
            <p className="eyebrow">Estimated building shade</p>
            {shadeState === "loading" ? <strong>Estimating building shade...</strong> : null}
            {shadeState === "error" ? <strong>Shade estimate unavailable</strong> : null}
            {shadeAnalysis && shadeState === "success" ? (
              <>
                <strong>
                  {shadeAnalysis.status === "night"
                    ? "Nighttime: no direct sun"
                    : `Estimated building shade ${Math.round(
                        shadeAnalysis.summary.shadeRatio * 100,
                      )}%`}
                </strong>
                <span>
                  {Math.round(shadeAnalysis.coverage.analyzedMeters)} m analyzed ·{" "}
                  confidence {Math.round(shadeAnalysis.summary.confidence * 100)}%
                </span>
                {showShadeDebug ? (
                  <div className="shade-debug-grid">
                    <small>
                      departure {formatDebugTime(shadeAnalysis.departureTime)} · solar{" "}
                      {Math.round(shadeAnalysis.solarPosition.azimuthDeg)}° az /{" "}
                      {Math.round(shadeAnalysis.solarPosition.elevationDeg)}° el
                    </small>
                    <small>
                      exact shaded {Math.round(shadeAnalysis.summary.shadedMeters)} m · exposed{" "}
                      {Math.round(shadeAnalysis.summary.exposedMeters)} m · unknown{" "}
                      {Math.round(shadeAnalysis.summary.unknownMeters)} m
                    </small>
                    <small>
                      height coverage {Math.round(shadeAnalysis.quality.heightCoverage * 100)}% ·{" "}
                      explicit {shadeAnalysis.coverage.explicitHeightBuildingCount} · derived{" "}
                      {shadeAnalysis.coverage.floorDerivedHeightBuildingCount} · unknown{" "}
                      {shadeAnalysis.coverage.unknownHeightBuildingCount}
                    </small>
                    <small>
                      segment sample: {formatSegmentDebug(shadeAnalysis)}
                    </small>
                  </div>
                ) : null}
              </>
            ) : null}
            {showShadeDebug ? <small>Debug layer: buildings, shadows, route segments</small> : null}
          </div>
        ) : null}

        {route ? (
          <div className="shade-estimate" aria-live="polite">
            <p className="eyebrow">Outdoor Comfort</p>
            {comfortState === "loading" ? <strong>Estimating outdoor comfort...</strong> : null}
            {comfortState === "error" ? <strong>Comfort estimate unavailable</strong> : null}
            {comfortAnalysis && comfortState === "success" ? (
              <>
                <strong>
                  {comfortAnalysis.summary.comfortScore === null
                    ? "Limited data"
                    : comfortAnalysis.summary.comfortScore}
                </strong>
                <span>
                  confidence {Math.round(comfortAnalysis.summary.confidence * 100)}% · completeness{" "}
                  {Math.round(comfortAnalysis.completeness.analyzedWeight * 100)}%
                </span>
                {showComfortDebug ? (
                  <div className="shade-debug-grid">
                    <small>
                      profile {comfortAnalysis.profile} · score{" "}
                      {comfortAnalysis.summary.scoreStatus} · total cost{" "}
                      {comfortAnalysis.summary.totalComfortCost.toFixed(1)}
                    </small>
                    <small>{formatComfortCompleteness(comfortAnalysis)}</small>
                    <small>
                      thermal {comfortAnalysis.summary.thermalExposure.toFixed(2)} · wind{" "}
                      {comfortAnalysis.summary.windExposure.toFixed(2)} · solar{" "}
                      {comfortAnalysis.summary.solarExposure.toFixed(2)} · rain{" "}
                      {comfortAnalysis.summary.rainExposure.toFixed(2)} · heat{" "}
                      {comfortAnalysis.summary.heatExposure.toFixed(2)}
                    </small>
                    <small>
                      dominant factors: {formatDominantFactors(comfortAnalysis)}
                    </small>
                    <small>
                      segment sample: {formatComfortSegmentDebug(comfortAnalysis)}
                    </small>
                  </div>
                ) : null}
              </>
            ) : null}
            {showComfortDebug ? <small>Debug layer: comfort cost route segments</small> : null}
          </div>
        ) : null}

        {route ? (
          <div className="shade-estimate" aria-live="polite">
            <p className="eyebrow">Estimated wind exposure</p>
            {windState === "loading" ? <strong>Estimating wind exposure...</strong> : null}
            {windState === "error" ? <strong>Wind estimate unavailable</strong> : null}
            {windAnalysis && windState === "success" ? (
              <>
                <strong>{formatWindExposureLabel(windAnalysis.summary.averageEstimatedExposureMps)}</strong>
                <span>
                  {Math.round(windAnalysis.coverage.analyzedMeters)} m analyzed · confidence{" "}
                  {Math.round(windAnalysis.summary.confidence * 100)}%
                </span>
                {showWindDebug ? (
                  <div className="shade-debug-grid">
                    <small>
                      regional wind {formatMps(windAnalysis.segmentWind[0]?.regionalWindSpeedMps ?? 0)} · from{" "}
                      {Math.round(windAnalysis.segmentWind[0]?.regionalWindDirectionDeg ?? 0)}°
                    </small>
                    <small>
                      exposure {formatMps(windAnalysis.summary.averageEstimatedExposureMps)} · headwind{" "}
                      {formatMps(windAnalysis.summary.averageHeadwindMps)} · crosswind{" "}
                      {formatMps(windAnalysis.summary.averageCrosswindMps)}
                    </small>
                    <small>
                      sheltered {Math.round(windAnalysis.summary.shelteredMeters)} m · neutral{" "}
                      {Math.round(windAnalysis.summary.neutralMeters)} m · exposed{" "}
                      {Math.round(windAnalysis.summary.exposedMeters)} m · unknown{" "}
                      {Math.round(windAnalysis.summary.unknownMeters)} m
                    </small>
                    <small>
                      segment sample: {formatWindSegmentDebug(windAnalysis)}
                    </small>
                  </div>
                ) : null}
              </>
            ) : null}
            {showWindDebug ? <small>Debug layer: wind exposure route segments</small> : null}
          </div>
        ) : null}

        {error ? <p className="error-message">{error}</p> : null}

        <div className="action-row">
          <button type="button" className="secondary-action" onClick={clearRoute}>
            Clear
          </button>
          <button
            type="button"
            className="primary-action"
            disabled={!canRoute || routeState === "loading"}
            onClick={calculateRoute}
          >
            {routeState === "loading" ? "Routing..." : "Get walking route"}
          </button>
        </div>
      </section>
    </main>
  );
}

function ComfortRouteCards({
  comparison,
  selectedCandidateId,
  contextualRouteLabel,
  onSelect,
}: {
  comparison: ComfortRouteComparisonResult;
  selectedCandidateId: string | null;
  contextualRouteLabel: ContextualRouteLabel;
  onSelect: (candidateId: string) => void;
}) {
  return (
    <>
      {comparison.candidates
        .filter((candidate) => candidate.role !== "alternative")
        .map((candidate) => {
          const explanations =
            candidate.role === "comfort"
              ? contextualRouteLabel === "Stay Dry"
                ? explainRainRoute({
                    fastest: comparison.fastest,
                    comfort: comparison.comfort,
                  })
                : contextualRouteLabel === "Stay Cool"
                  ? explainHeatRoute({
                      fastest: comparison.fastest,
                      comfort: comparison.comfort,
                    })
                : explainComfortRoute({
                    fastest: comparison.fastest,
                    comfort: comparison.comfort,
                  })
              : [];
          const selected = candidate.id === selectedCandidateId;

          return (
            <button
              key={candidate.id}
              type="button"
              className={`route-option ${selected ? "selected" : ""} ${
                candidate.role === "comfort" ? "comfort-option" : ""
              }`}
              aria-pressed={selected}
              onClick={() => onSelect(candidate.id)}
            >
              <span className="route-option-main">
                <span>
                  <span className="eyebrow route-eyebrow">
                    {formatCandidateLabel(candidate, contextualRouteLabel)}
                  </span>
                  <strong>{formatDuration(candidate.route.durationSeconds)}</strong>
                </span>
                <span>{formatDistance(candidate.route.distanceMeters)}</span>
              </span>
              {candidate.role === "comfort" ? (
                <span className="route-tradeoff">
                  +{formatDuration(candidate.metrics.extraDurationSeconds)} ·{" "}
                  {explanations[0]?.label ?? "Lower environmental exposure"}
                </span>
              ) : candidate.role === "fastest-and-comfort" && candidate.status === "complete" ? (
                <span className="route-note-inline">
                  {contextualRouteLabel === "Stay Dry"
                    ? "Best choice right now. Fastest is also the driest option we found."
                    : contextualRouteLabel === "Stay Cool"
                      ? "Best choice right now. Fastest has the lowest estimated heat exposure we found."
                    : "Best choice right now. Fastest is also the most comfortable based on current conditions."}
                </span>
              ) : candidate.role === "fastest-and-comfort" ? (
                <span className="route-note-inline">
                  Fastest route is ready. Comfort analysis has limited environmental data.
                </span>
              ) : (
                <span className="route-note-inline">
                  Standard walking route for the time comparison.
                </span>
              )}
              {candidate.role === "comfort" && explanations.length > 1 ? (
                <span className="route-note-inline">
                  {explanations.slice(1).map((item) => item.label).join(" · ")}
                </span>
              ) : null}
              {candidate.status !== "complete" ? (
                <span className="route-note-inline">Limited environmental data.</span>
              ) : null}
            </button>
          );
        })}
    </>
  );
}

function ComfortProgressPanel({
  state,
  contextReason,
  contextualRouteLabel,
  fastest,
  comfort,
  weatherState,
}: {
  state: ComfortAnalysisState;
  contextReason: string;
  contextualRouteLabel: ContextualRouteLabel;
  fastest: AnalyzedRouteCandidate | null;
  comfort: AnalyzedRouteCandidate | null;
  weatherState: WeatherState;
}) {
  if (weatherState === "error") {
    return (
      <div className="comfort-progress limited">
        <strong>Live conditions unavailable.</strong>
        <span>Standard walking route is still available.</span>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="comfort-progress" aria-live="polite">
        <strong>Analyzing outdoor comfort...</strong>
        <span>
          {contextualRouteLabel === "Stay Warm"
            ? "Checking cold and wind exposure."
            : contextualRouteLabel === "Stay Dry"
              ? "Checking rain exposure and covered walking."
              : contextualRouteLabel === "Stay Cool"
                ? "Checking heat exposure and estimated building shade."
              : "Checking environmental alternatives."}
        </span>
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div className="comfort-progress limited">
        <strong>Comfort analysis unavailable.</strong>
        <span>{state.reason}</span>
      </div>
    );
  }

  if (state.status === "limited") {
    return (
      <div className="comfort-progress limited">
        <strong>Limited environmental data.</strong>
        <span>Fastest remains fully usable.</span>
      </div>
    );
  }

  if (state.status === "complete" && fastest && comfort) {
    if (fastest.id === comfort.id) {
      return (
        <div className="comfort-progress complete">
          <strong>Best choice right now.</strong>
          <span>
            {contextualRouteLabel === "Stay Dry"
              ? "The fastest route is also the driest option we found."
              : contextualRouteLabel === "Stay Cool"
                ? "The fastest route has the lowest estimated heat exposure we found."
              : "The fastest route is also the most comfortable based on current conditions."}
          </span>
        </div>
      );
    }

    return (
      <div className="comfort-progress complete">
        <strong>{contextualRouteLabel} route found.</strong>
        <span>{contextReason}</span>
      </div>
    );
  }

  return null;
}

function formatCandidateLabel(
  candidate: AnalyzedRouteCandidate,
  contextualRouteLabel: ContextualRouteLabel,
) {
  if (candidate.role === "comfort") return `${contextualRouteLabel} · Recommended`;
  if (candidate.role === "fastest-and-comfort") return "Fastest";
  return "Fastest";
}

function hasComparableComfort(comparison: ComfortRouteComparisonResult) {
  return comparison.candidates.some(
    (candidate) => candidate.comfortAnalysis?.routeComfortCost.comparable === true,
  );
}

function explainRainRoute({
  fastest,
  comfort,
}: {
  fastest: AnalyzedRouteCandidate;
  comfort: AnalyzedRouteCandidate;
}) {
  const fastestExposure = fastest.rainAnalysis?.summary.averageRainExposure;
  const comfortExposure = comfort.rainAnalysis?.summary.averageRainExposure;
  if (
    typeof fastestExposure !== "number" ||
    typeof comfortExposure !== "number" ||
    fastestExposure <= 0
  ) {
    return [{ label: "Lower estimated rain exposure" }];
  }

  const reduction = Math.max(0, (fastestExposure - comfortExposure) / fastestExposure);
  if (reduction < 0.03) return [{ label: "Lower estimated rain exposure" }];
  return [{ label: `${Math.round(reduction * 100)}% lower estimated rain exposure` }];
}

function explainHeatRoute({
  fastest,
  comfort,
}: {
  fastest: AnalyzedRouteCandidate;
  comfort: AnalyzedRouteCandidate;
}) {
  const fastestExposure = fastest.heatAnalysis?.summary.averageHeatExposure;
  const comfortExposure = comfort.heatAnalysis?.summary.averageHeatExposure;
  const explanations: Array<{ label: string }> = [];

  if (
    typeof fastestExposure === "number" &&
    typeof comfortExposure === "number" &&
    fastestExposure > 0
  ) {
    const reduction = Math.max(0, (fastestExposure - comfortExposure) / fastestExposure);
    if (reduction >= 0.03) {
      explanations.push({ label: `${Math.round(reduction * 100)}% lower estimated heat exposure` });
    }
  }

  const fastestSun = fastest.heatAnalysis?.summary.directSunRatio;
  const comfortSun = comfort.heatAnalysis?.summary.directSunRatio;
  if (
    typeof fastestSun === "number" &&
    typeof comfortSun === "number" &&
    fastestSun - comfortSun >= 0.05
  ) {
    explanations.push({
      label: `${Math.round((fastestSun - comfortSun) * 100)}% less direct sun`,
    });
  }

  const fastestShade = fastest.heatAnalysis?.summary.shadeRatio;
  const comfortShade = comfort.heatAnalysis?.summary.shadeRatio;
  if (
    typeof fastestShade === "number" &&
    typeof comfortShade === "number" &&
    comfortShade - fastestShade >= 0.05
  ) {
    explanations.push({ label: "More estimated building shade" });
  }

  return explanations.length > 0 ? explanations : [{ label: "Lower estimated heat exposure" }];
}

function formatRainExposureLabel(value: number) {
  if (value <= 0.02) return "Minimal estimated rain exposure";
  if (value <= 0.25) return "Light estimated rain exposure";
  if (value <= 0.6) return "Moderate estimated rain exposure";
  return "High estimated rain exposure";
}

function formatHeatExposureLabel(value: number) {
  if (value <= 0.05) return "Minimal estimated heat exposure";
  if (value <= 0.7) return "Low estimated heat exposure";
  if (value <= 1.7) return "Moderate estimated heat exposure";
  return "High estimated heat exposure";
}

function formatNullableNumber(value: number | null | undefined, unit: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  return `${Math.round(value * 10) / 10}${unit}`;
}

function formatDebugTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSegmentDebug(shadeAnalysis: ShadeAnalysisResult) {
  const segment = shadeAnalysis.segmentShade[0];
  if (!segment?.estimatedMidpointTime) return "none";

  return `${formatDebugTime(segment.estimatedMidpointTime)} · ${Math.round(
    segment.shadedMeters,
  )}/${Math.round(segment.totalMeters)} m · ${Math.round(
    segment.solarAzimuthDeg ?? 0,
  )}° az`;
}

function formatWindExposureLabel(exposureMps: number) {
  if (exposureMps < 1.5) return "Estimated wind exposure: Low";
  if (exposureMps < 3.5) return "Estimated wind exposure: Moderate";
  return "Estimated wind exposure: High";
}

function formatMps(value: number) {
  return `${value.toFixed(1)} m/s`;
}

function formatMilliseconds(value?: number) {
  if (value === undefined) return "n/a";
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${value} ms`;
}

function formatWindSegmentDebug(windAnalysis: WindAnalysisResult) {
  const segment = windAnalysis.segmentWind[0];
  if (!segment) return "none";

  return `${formatDebugTime(segment.estimatedMidpointTime)} · bearing ${Math.round(
    segment.segmentBearingDeg,
  )}° · shelter ${Math.round(segment.shelterFactor * 100)}% · exposure ${formatMps(
    segment.estimatedExposureMps,
  )}`;
}

function formatRainSegmentDebug(rainAnalysis: RainAnalysisResult) {
  const segment = rainAnalysis.segmentRain[0];
  if (!segment) return "none";

  return `${formatDebugTime(segment.timestamp)} · exposure ${segment.estimatedRainExposure.toFixed(
    2,
  )} · covered ${Math.round(segment.coveredRatio * 100)}% · wind modifier ${segment.windDrivenExposureFactor.toFixed(
    2,
  )}`;
}

function formatHeatSegmentDebug(heatAnalysis: HeatAnalysisResult) {
  const segment = heatAnalysis.segmentHeat[0];
  if (!segment) return "none";

  return `${formatDebugTime(segment.timestamp)} · heat ${segment.totalHeatExposureCost.toFixed(
    2,
  )} · direct sun ${
    segment.directSunRatio === null ? "n/a" : `${Math.round(segment.directSunRatio * 100)}%`
  } · temp ${
    segment.effectiveHeatTemperatureC === null
      ? "n/a"
      : `${segment.effectiveHeatTemperatureC.toFixed(1)}°C`
  }`;
}

function formatDominantFactors(comfortAnalysis: ComfortAnalysisResult) {
  if (!comfortAnalysis.summary.dominantFactors.length) return "none";

  return comfortAnalysis.summary.dominantFactors
    .map(
      (factor) =>
        `${factor.type} ${Math.round(factor.contribution * 100)}%`,
    )
    .join(" · ");
}

function formatComfortSegmentDebug(comfortAnalysis: ComfortAnalysisResult) {
  const segment = comfortAnalysis.segmentComfort[0];
  if (!segment) return "none";

  const windChill =
    segment.estimatedPedestrianWindChillC === null
      ? "n/a"
      : `${segment.estimatedPedestrianWindChillC.toFixed(1)}°C`;

  return `${formatDebugTime(segment.estimatedMidpointTime)} · temp ${
    segment.temperatureC === null ? "n/a" : `${segment.temperatureC.toFixed(1)}°C`
  } · estimated wind chill ${windChill} · cost ${segment.comfortCostRate.toFixed(
    2,
  )}`;
}

function formatComfortCompleteness(comfortAnalysis: ComfortAnalysisResult) {
  const completeness = comfortAnalysis.completeness;

  return `available: weather ${formatBoolean(completeness.weatherAvailable)} · wind ${formatBoolean(
    completeness.windAvailable,
  )} · shade ${formatBoolean(completeness.shadeAvailable)} · rain ${formatBoolean(
    completeness.rainAvailable,
  )} · heat ${formatBoolean(completeness.heatAvailable)}`;
}

function formatBoolean(value: boolean) {
  return value ? "yes" : "no";
}
