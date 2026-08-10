"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ComfortMap } from "./ComfortMap";
import type { Coordinate } from "@/lib/geo/types";
import type { RouteResult } from "@/lib/routing/types";
import { formatCoordinate, formatDistance, formatDuration } from "@/lib/geo/format";
import { requestComfortRouteComparison } from "@/lib/routing/client";
import type { PlaceResult } from "@/lib/geocoding/types";
import { reverseGeocode, searchPlaces } from "@/lib/geocoding/client";
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
import type { ComfortAnalysisResult } from "@/lib/comfort/types";
import type { ComfortRouteComparisonResult } from "@/lib/comfort-routing/types";
import { EnvironmentSummary } from "./EnvironmentSummary";

type SelectionMode = "origin" | "destination";
type RouteState = "idle" | "loading" | "success" | "error";
type SearchState = "idle" | "loading" | "success" | "empty" | "error";
type WeatherState = "idle" | "loading" | "success" | "error";
type ShadeState = "idle" | "loading" | "success" | "error";
type WindState = "idle" | "loading" | "success" | "error";
type ComfortState = "idle" | "loading" | "success" | "error";

export function StageZeroApp() {
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
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [focusCoordinate, setFocusCoordinate] = useState<Coordinate | null>(null);
  const [currentLocationCoordinate, setCurrentLocationCoordinate] =
    useState<Coordinate | null>(null);
  const [weather, setWeather] = useState<WeatherBundle | null>(null);
  const [weatherState, setWeatherState] = useState<WeatherState>("idle");
  const [shadeAnalysis, setShadeAnalysis] = useState<ShadeAnalysisResult | null>(null);
  const [shadeState, setShadeState] = useState<ShadeState>("idle");
  const [windAnalysis, setWindAnalysis] = useState<WindAnalysisResult | null>(null);
  const [windState, setWindState] = useState<WindState>("idle");
  const [comfortAnalysis, setComfortAnalysis] = useState<ComfortAnalysisResult | null>(null);
  const [comfortState, setComfortState] = useState<ComfortState>("idle");
  const [geolocationStatus, setGeolocationStatus] =
    useState<GeolocationStatus>("idle");
  const searchRequestId = useRef(0);
  const routeRequestId = useRef(0);

  const originCoordinate = origin?.coordinate ?? null;
  const destinationCoordinate = destination?.coordinate ?? null;
  const weatherCoordinate = selectWeatherCoordinate({
    selectedOrigin: originCoordinate,
    currentLocation: currentLocationCoordinate,
  });
  const debugMode =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("debug")
      : null;
  const showShadeDebug = debugMode === "shade" || debugMode === "environment";
  const showWindDebug = debugMode === "wind" || debugMode === "environment";
  const showComfortDebug = debugMode === "comfort" || debugMode === "environment";
  const showRoutingDebug = debugMode === "routing" || debugMode === "environment";

  useEffect(() => {
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
          originCoordinate ?? destinationCoordinate ?? undefined,
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
  }, [destinationCoordinate, originCoordinate, query]);

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
      setRoute(null);
      setRouteComparison(null);
      setSelectedCandidateId(null);
      setRouteState("idle");
      setShadeAnalysis(null);
      setShadeState("idle");
      setWindAnalysis(null);
      setWindState("idle");
      setComfortAnalysis(null);
      setComfortState("idle");
      setError(null);
    },
    [selectionMode],
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

    try {
      const departureTime = new Date().toISOString();
      setRouteComparison(null);
      setSelectedCandidateId(null);
      setShadeAnalysis(null);
      setShadeState("loading");
      setWindAnalysis(null);
      setWindState("loading");
      setComfortAnalysis(null);
      setComfortState("loading");

      const comparison = await requestComfortRouteComparison({
        origin: originCoordinate,
        destination: destinationCoordinate,
        departureTime,
        weatherCoordinate,
        weatherBundle: weather ?? undefined,
        generationMode: "enhanced",
        includeEnvironmentalDebug: showShadeDebug || showWindDebug || showComfortDebug,
      });
      if (routeRequestId.current !== requestId) return;
      const selectedCandidate = comparison.comfort;
      setRouteComparison(comparison);
      setSelectedCandidateId(selectedCandidate.id);
      setRoute(selectedCandidate.route);
      setRouteState("success");
      setShadeAnalysis(selectedCandidate.shadeAnalysis ?? null);
      setShadeState(selectedCandidate.shadeAnalysis ? "success" : "error");
      setWindAnalysis(selectedCandidate.windAnalysis ?? null);
      setWindState(selectedCandidate.windAnalysis ? "success" : "error");
      setComfortAnalysis(selectedCandidate.comfortAnalysis ?? null);
      setComfortState(selectedCandidate.comfortAnalysis ? "success" : "error");
    } catch (routeError) {
      if (routeRequestId.current !== requestId) return;
      setRoute(null);
      setRouteComparison(null);
      setSelectedCandidateId(null);
      setShadeAnalysis(null);
      setShadeState("idle");
      setWindAnalysis(null);
      setWindState("idle");
      setComfortAnalysis(null);
      setComfortState("idle");
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
    setOrigin(null);
    setDestination(null);
    setRoute(null);
    setRouteComparison(null);
    setSelectedCandidateId(null);
    setShadeAnalysis(null);
    setShadeState("idle");
    setWindAnalysis(null);
    setWindState("idle");
    setComfortAnalysis(null);
    setComfortState("idle");
    setSelectionMode("origin");
    setRouteState("idle");
    setError(null);
  }

  function selectSearchResult(place: PlaceResult) {
    setPlaceForMode(place);
    setQuery("");
    setPlaces([]);
    setSearchState("idle");
    setSearchError(null);
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
        setRoute(null);
        setRouteComparison(null);
        setSelectedCandidateId(null);
        setShadeAnalysis(null);
        setShadeState("idle");
        setWindAnalysis(null);
        setWindState("idle");
        setComfortAnalysis(null);
        setComfortState("idle");
        setRouteState("idle");
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
    setShadeAnalysis(candidate.shadeAnalysis ?? null);
    setShadeState(candidate.shadeAnalysis ? "success" : "error");
    setWindAnalysis(candidate.windAnalysis ?? null);
    setWindState(candidate.windAnalysis ? "success" : "error");
    setComfortAnalysis(candidate.comfortAnalysis ?? null);
    setComfortState(candidate.comfortAnalysis ? "success" : "error");
  }

  return (
    <main className="app-shell">
      <ComfortMap
        origin={originCoordinate}
        destination={destinationCoordinate}
        routeGeometry={route?.geometry ?? null}
        comparisonRouteGeometries={comparisonRouteGeometries}
        shadeAnalysis={shadeAnalysis}
        windAnalysis={windAnalysis}
        comfortAnalysis={comfortAnalysis}
        showShadeDebug={showShadeDebug}
        showWindDebug={showWindDebug}
        showComfortDebug={showComfortDebug}
        selectionMode={selectionMode}
        focusCoordinate={focusCoordinate}
        onMapSelect={handleMapSelect}
      />

      <section className="top-chrome" aria-label="Current map context">
        <div className="top-title">
          <p className="eyebrow">ComfortOS Stage 5</p>
          <h1>Minneapolis</h1>
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

        {places.length > 0 ? (
          <div id="place-results" className="place-results" role="listbox">
            {places.map((place) => (
              <button
                key={place.id}
                type="button"
                className="place-result"
                role="option"
                aria-selected="false"
                onClick={() => selectSearchResult(place)}
              >
                <span>{place.name}</span>
                <small>{place.address ?? place.category ?? formatCoordinate(place.coordinate)}</small>
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

        {routeComparison ? (
          <div className="route-options" aria-label="Route comparison">
            {routeComparison.candidates
              .filter((candidate) => candidate.role !== "alternative")
              .map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className={`route-option ${
                    candidate.id === selectedCandidateId ? "selected" : ""
                  } ${candidate.role === "comfort" ? "comfort-option" : ""}`}
                  aria-pressed={candidate.id === selectedCandidateId}
                  onClick={() => selectRouteCandidate(candidate.id)}
                >
                  <span className="route-option-main">
                    <span>
                      <span className="eyebrow route-eyebrow">
                        {formatCandidateLabel(candidate.role)}
                      </span>
                      <strong>{formatDuration(candidate.route.durationSeconds)}</strong>
                    </span>
                    <span>{formatDistance(candidate.route.distanceMeters)}</span>
                  </span>
                  {candidate.role === "comfort" ? (
                    <span className="route-tradeoff">
                      +{formatDuration(candidate.metrics.extraDurationSeconds)} ·{" "}
                      {Math.round(
                        candidate.metrics.environmentalCostReductionRatio * 100,
                      )}
                      % lower environmental exposure
                    </span>
                  ) : candidate.role === "fastest-and-comfort" ? (
                    <span className="route-note-inline">
                      Fastest route is also the lowest comparable comfort cost.
                    </span>
                  ) : (
                    <span className="route-note-inline">
                      Baseline walking route for the time comparison.
                    </span>
                  )}
                  {candidate.comfortAnalysis?.summary.comfortScore === null ? (
                    <span className="route-note-inline">Limited data</span>
                  ) : candidate.comfortAnalysis ? (
                    <span className="route-note-inline">
                      Comfort {candidate.comfortAnalysis.summary.comfortScore} · raw cost{" "}
                      {candidate.comfortAnalysis.summary.averageComfortCost.toFixed(2)}
                    </span>
                  ) : null}
                </button>
              ))}
          </div>
        ) : (
          <div className="route-card" aria-live="polite">
            <div className="route-card-head">
              <div>
                <p className="eyebrow route-eyebrow">Fastest</p>
                <h2>
                  {route
                    ? `${formatDuration(route.durationSeconds)} walk`
                    : "Set two points"}
                </h2>
              </div>
              {route ? <span>{formatDistance(route.distanceMeters)}</span> : null}
            </div>

            {route ? (
              <p className="route-note">
                {origin?.name} to {destination?.name}.
              </p>
            ) : (
              <p className="route-note">
                Search, use current location, or tap the map to set both points.
              </p>
            )}
          </div>
        )}

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
            {routeComparison.debug.buildings ? (
              <small>
                buildings {routeComparison.debug.buildings.providerMode} · loaded{" "}
                {routeComparison.debug.buildings.loadedBuildings} · explicit{" "}
                {routeComparison.debug.buildings.explicitHeightBuildings} · floors{" "}
                {routeComparison.debug.buildings.floorDerivedHeightBuildings} · unknown{" "}
                {routeComparison.debug.buildings.unknownHeightBuildings} · query{" "}
                {formatBoolean(routeComparison.debug.buildings.querySucceeded)}
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
                  raw cost {comfortAnalysis.summary.averageComfortCost.toFixed(2)} · confidence{" "}
                  {Math.round(comfortAnalysis.summary.confidence * 100)}% · completeness{" "}
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
                      {comfortAnalysis.summary.solarExposure.toFixed(2)}
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

        {weather?.alerts[0] ? (
          <div className="weather-alert">
            <strong>{weather.alerts[0].event}</strong>
            <span>{weather.alerts[0].headline ?? "Active NWS alert."}</span>
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

function formatDebugTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCandidateLabel(role: string) {
  if (role === "comfort") return "Comfort · Recommended";
  if (role === "fastest-and-comfort") return "Fastest + Comfort";
  return "Fastest";
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

function formatWindSegmentDebug(windAnalysis: WindAnalysisResult) {
  const segment = windAnalysis.segmentWind[0];
  if (!segment) return "none";

  return `${formatDebugTime(segment.estimatedMidpointTime)} · bearing ${Math.round(
    segment.segmentBearingDeg,
  )}° · shelter ${Math.round(segment.shelterFactor * 100)}% · exposure ${formatMps(
    segment.estimatedExposureMps,
  )}`;
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
  )} · shade ${formatBoolean(completeness.shadeAvailable)}`;
}

function formatBoolean(value: boolean) {
  return value ? "yes" : "no";
}
