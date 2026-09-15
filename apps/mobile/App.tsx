import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Gauge,
  Info,
  LocateFixed,
  MapPin,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { AhhwayMap } from "./src/components/AhhwayMap";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import {
  getComfortComparison,
  getFastestRoute,
  getWeather,
  productUrl,
  retrievePlace,
  reverseGeocode,
  searchPlaces,
} from "./src/api/client";
import { RequestTimeoutError } from "./src/api/request";
import {
  candidateLabel,
  formatCoveredDistance,
  formatDistance,
  formatDuration,
  formatPercent,
  routeExplanation,
  weatherSummary,
} from "./src/domain/presentation";
import { COLORS, SHADOW } from "./src/theme";
import type {
  CapabilityQuality,
  ComfortComparison,
  Coordinate,
  Place,
  PlaceSuggestion,
  RouteCandidate,
  RouteResult,
  WeatherBundle,
} from "./src/types";

type SelectionMode = "origin" | "destination";
type AsyncState = "idle" | "loading" | "success" | "error";

const SEARCH_DELAY_MS = 320;
const LOCATION_TIMEOUT_MS = 12_000;

export default function App() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <AhhwayApp />
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

function AhhwayApp() {
  const insets = useSafeAreaInsets();
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("destination");
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<AsyncState>("idle");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [fastestRoute, setFastestRoute] = useState<RouteResult | null>(null);
  const [comparison, setComparison] = useState<ComfortComparison | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [routeState, setRouteState] = useState<AsyncState>("idle");
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherBundle | null>(null);
  const [weatherState, setWeatherState] = useState<AsyncState>("idle");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tripEditorOpen, setTripEditorOpen] = useState(true);
  const [mapCenter, setMapCenter] = useState<Coordinate | null>(null);
  const [focusCoordinate, setFocusCoordinate] = useState<Coordinate | null>(null);
  const [locationState, setLocationState] = useState<AsyncState>("idle");
  const [infoOpen, setInfoOpen] = useState(false);
  const [userCoordinate, setUserCoordinate] = useState<Coordinate | null>(null);
  const searchSession = useRef(createSessionToken());
  const searchRequest = useRef(0);
  const placeRequest = useRef(0);
  const routeRequest = useRef(0);
  const routeAbort = useRef<AbortController | null>(null);

  const selectedCandidate = useMemo(() => {
    if (!comparison) return null;
    return (
      comparison.candidates.find((candidate) => candidate.id === selectedCandidateId) ??
      comparison.comfort
    );
  }, [comparison, selectedCandidateId]);

  const visibleCandidates = useMemo(() => {
    if (!comparison) return [];
    return comparison.candidates.filter((candidate) => candidate.role !== "alternative");
  }, [comparison]);

  const mapCandidates = useMemo(() => {
    if (comparison) return comparison.candidates;
    if (!fastestRoute) return [];
    return [temporaryFastestCandidate(fastestRoute)];
  }, [comparison, fastestRoute]);

  const resetRoutes = useCallback(() => {
    routeRequest.current += 1;
    routeAbort.current?.abort();
    setFastestRoute(null);
    setComparison(null);
    setSelectedCandidateId(null);
    setRouteState("idle");
    setRouteNotice(null);
    setDetailsOpen(false);
  }, []);

  const applyPlace = useCallback(
    (place: Place, mode: SelectionMode) => {
      if (mode === "origin") {
        setOrigin(place);
        setSelectionMode("destination");
      } else {
        setDestination(place);
      }
      setMapCenter(place.coordinate);
      setFocusCoordinate(place.coordinate);
      setQuery("");
      setSuggestions([]);
      setSearchState("idle");
      resetRoutes();
      Keyboard.dismiss();
    },
    [resetRoutes],
  );

  useEffect(() => {
    if (!origin) {
      setWeather(null);
      setWeatherState("idle");
      return;
    }

    const controller = new AbortController();
    setWeatherState("loading");
    getWeather(origin.coordinate, controller.signal)
      .then((nextWeather) => {
        setWeather(nextWeather);
        setWeatherState("success");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setWeather(null);
          setWeatherState("error");
        }
      });

    return () => controller.abort();
  }, [origin]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setSuggestions([]);
      setSearchState("idle");
      return;
    }

    const requestId = searchRequest.current + 1;
    searchRequest.current = requestId;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchState("loading");
      searchPlaces(
        normalized,
        mapCenter ?? origin?.coordinate ?? userCoordinate ?? undefined,
        searchSession.current,
        controller.signal,
      )
        .then((places) => {
          if (searchRequest.current !== requestId) return;
          setSuggestions(places);
          setSearchState("success");
        })
        .catch(() => {
          if (controller.signal.aborted || searchRequest.current !== requestId) return;
          setSuggestions([]);
          setSearchState("error");
        });
    }, SEARCH_DELAY_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mapCenter, origin, query, userCoordinate]);

  async function chooseSuggestion(suggestion: PlaceSuggestion) {
    const requestId = placeRequest.current + 1;
    placeRequest.current = requestId;
    const mode = selectionMode;
    setSearchState("loading");
    try {
      const place = suggestion.coordinate
        ? ({ ...suggestion, coordinate: suggestion.coordinate } as Place)
        : await retrievePlace(suggestion.id, searchSession.current);
      if (placeRequest.current !== requestId) return;
      applyPlace(place, mode);
      searchSession.current = createSessionToken();
      await Haptics.selectionAsync();
    } catch {
      if (placeRequest.current !== requestId) return;
      setSearchState("error");
    }
  }

  async function useCurrentLocation() {
    if (locationState === "loading") return;
    const requestId = placeRequest.current + 1;
    placeRequest.current = requestId;
    setLocationState("loading");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (placeRequest.current !== requestId) return;
      if (!permission.granted) {
        setLocationState("error");
        Alert.alert(
          "Location is off",
          "You can still choose a starting point by searching or pressing and holding the map.",
        );
        return;
      }

      const result = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        LOCATION_TIMEOUT_MS,
      );
      if (placeRequest.current !== requestId) return;
      const coordinate = {
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
      };
      setUserCoordinate(coordinate);
      setMapCenter(coordinate);
      setFocusCoordinate(coordinate);
      setLocationState("success");

      const place =
        (await reverseGeocode(coordinate).catch(() => null)) ??
        coordinatePlace(coordinate, "Current location");
      if (placeRequest.current !== requestId) return;
      applyPlace(place, "origin");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      if (placeRequest.current !== requestId) return;
      setLocationState("error");
      Alert.alert("Location unavailable", "Try again or choose a starting point manually.");
    }
  }

  async function selectMapPoint(coordinate: Coordinate) {
    const requestId = placeRequest.current + 1;
    placeRequest.current = requestId;
    setLocationState("idle");
    const mode = selectionMode;
    const temporary = coordinatePlace(
      coordinate,
      mode === "origin" ? "Selected start" : "Selected destination",
    );
    applyPlace(temporary, mode);
    await Haptics.selectionAsync();

    reverseGeocode(coordinate)
      .then((place) => {
        if (placeRequest.current === requestId && place) applyPlace(place, mode);
      })
      .catch(() => undefined);
  }

  async function calculateRoute() {
    if (!origin || !destination) {
      setRouteNotice("Choose both a start and destination.");
      return;
    }

    const requestId = routeRequest.current + 1;
    routeRequest.current = requestId;
    routeAbort.current?.abort();
    const controller = new AbortController();
    routeAbort.current = controller;
    setRouteState("loading");
    setRouteNotice(null);
    setFastestRoute(null);
    setComparison(null);
    setSelectedCandidateId(null);
    setDetailsOpen(false);
    setTripEditorOpen(false);
    Keyboard.dismiss();

    const request = {
      origin: origin.coordinate,
      destination: destination.coordinate,
      departureTime: new Date().toISOString(),
    };

    try {
      const fastest = await getFastestRoute(request, controller.signal);
      if (routeRequest.current !== requestId) return;
      setFastestRoute(fastest);
      setRouteState("success");

      try {
        const result = await getComfortComparison(request, controller.signal);
        if (routeRequest.current !== requestId) return;
        setComparison(result);
        setSelectedCandidateId(result.comfort.id);
        setFastestRoute(result.comfort.route);
        const comparable = result.candidates.some(
          (candidate) => candidate.comfortAnalysis?.routeComfortCost.comparable === true,
        );
        if (!comparable) {
          setRouteNotice("Comfort data is limited here. The fastest walk is still available.");
        }
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        if (routeRequest.current !== requestId) return;
        setRouteNotice(
          error instanceof RequestTimeoutError
            ? "The comfort check took too long. Showing the fastest walk."
            : "Comfort comparison is unavailable. Showing the fastest walk.",
        );
      }
    } catch (error) {
      if (routeRequest.current !== requestId) return;
      setRouteState("error");
      setRouteNotice(
        error instanceof RequestTimeoutError
          ? "The route request took too long. Check your connection and try again."
          : "We could not find a walking route. Check the trip points and try again.",
      );
      setTripEditorOpen(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      if (routeRequest.current === requestId) routeAbort.current = null;
    }
  }

  function selectCandidate(candidate: RouteCandidate) {
    setSelectedCandidateId(candidate.id);
    setFastestRoute(candidate.route);
    Haptics.selectionAsync().catch(() => undefined);
  }

  function resetTrip() {
    placeRequest.current += 1;
    resetRoutes();
    setOrigin(null);
    setDestination(null);
    setWeather(null);
    setSelectionMode("destination");
    setTripEditorOpen(true);
    setQuery("");
  }

  const conditions =
    weatherState === "error" && origin
      ? { primary: "Weather unavailable", secondary: "Route search is still available" }
      : weatherSummary(weather);
  const routeLabel = candidateLabel(comparison?.debug.context?.context ?? "balanced");
  const activeAlert = weather?.alerts[0] ?? null;

  function beginSearch(mode: SelectionMode) {
    placeRequest.current += 1;
    setLocationState("idle");
    setSelectionMode(mode);
    setQuery("");
    setSuggestions([]);
    setSearchState("idle");
  }

  async function openProductInfo(path: string) {
    try {
      await Linking.openURL(productUrl(path));
    } catch {
      Alert.alert("Could not open this page", "Please try again when you are online.");
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <AhhwayMap
        origin={origin?.coordinate ?? null}
        destination={destination?.coordinate ?? null}
        candidates={mapCandidates}
        selectedCandidateId={selectedCandidateId}
        focusCoordinate={focusCoordinate}
        userCoordinate={userCoordinate}
        onLongPress={selectMapPoint}
        onCenterChange={setMapCenter}
      />

      <View style={[styles.brandBar, { top: insets.top + 10 }]}>
        <View style={styles.brandMark}>
          <Image
            accessible={false}
            accessibilityIgnoresInvertColors
            source={require("./assets/icon.png")}
            style={styles.brandMarkImage}
          />
        </View>
        <View style={styles.brandCopy}>
          <Text style={styles.brandName}>Ahhway</Text>
          <View style={styles.brandSignal} />
        </View>
        <View style={styles.weatherDivider} />
        {weatherState === "loading" ? (
          <ActivityIndicator color={COLORS.comfort} size="small" />
        ) : (
          <View style={styles.weatherCopy}>
            <Text numberOfLines={1} style={styles.weatherPrimary}>
              {conditions.primary}
            </Text>
            <Text numberOfLines={1} style={styles.weatherSecondary}>
              {conditions.secondary}
            </Text>
          </View>
        )}
      </View>

      <Pressable
        accessibilityLabel="Product information"
        accessibilityRole="button"
        onPress={() => setInfoOpen(true)}
        style={({ pressed }) => [
          styles.infoButton,
          { top: insets.top + 10 },
          pressed && styles.pressed,
        ]}
      >
        <Info size={21} color={COLORS.ink} />
      </Pressable>

      <Pressable
        accessibilityLabel="Use my current location"
        accessibilityRole="button"
        disabled={locationState === "loading"}
        onPress={useCurrentLocation}
        style={({ pressed }) => [
          styles.locationButton,
          { top: insets.top + 76 },
          locationState === "loading" && styles.locationButtonDisabled,
          pressed && styles.pressed,
        ]}
      >
        {locationState === "loading" ? (
          <ActivityIndicator color={COLORS.ink} size="small" />
        ) : (
          <LocateFixed size={21} color={COLORS.ink} />
        )}
      </Pressable>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
        pointerEvents="box-none"
        style={styles.keyboardLayer}
      >
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.sheetHandle} />
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.sheetScroll}
          >

          {!tripEditorOpen && origin && destination ? (
            <View style={styles.tripSummaryRow}>
              <Pressable
                accessibilityLabel={`Edit trip from ${origin.name} to ${destination.name}`}
                accessibilityRole="button"
                onPress={() => setTripEditorOpen(true)}
                style={({ pressed }) => [styles.tripSummaryButton, pressed && styles.pressed]}
              >
                <View style={styles.pointDotOrigin} />
                <Text numberOfLines={1} style={styles.tripSummaryText}>
                  {origin.name}
                </Text>
                <ArrowRight size={15} color={COLORS.muted} />
                <View style={styles.pointDotDestination} />
                <Text numberOfLines={1} style={styles.tripSummaryText}>
                  {destination.name}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Clear trip"
                accessibilityRole="button"
                onPress={resetTrip}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <RotateCcw size={18} color={COLORS.ink} />
              </Pressable>
            </View>
          ) : (
            <TripEditor
              origin={origin}
              destination={destination}
              query={query}
              selectionMode={selectionMode}
              searchState={searchState}
              suggestions={suggestions}
              onFocus={beginSearch}
              onQueryChange={setQuery}
              onClearQuery={() => setQuery("")}
              onChooseSuggestion={chooseSuggestion}
              onUseCurrentLocation={useCurrentLocation}
            />
          )}

          {activeAlert ? (
            <View accessibilityLiveRegion="assertive" style={styles.alertRow}>
              <AlertTriangle size={17} color={COLORS.alert} />
              <Text numberOfLines={2} style={styles.alertText}>
                {activeAlert.event}: {activeAlert.headline}
              </Text>
            </View>
          ) : null}

          {routeNotice ? (
            <Text accessibilityLiveRegion="polite" style={styles.noticeText}>
              {routeNotice}
            </Text>
          ) : null}

          {(routeState === "idle" || routeState === "error") && !query ? (
            <View style={styles.actionArea}>
              <Text style={styles.mapHint}>Press and hold the map to place the active trip point.</Text>
              <Pressable
                accessibilityRole="button"
                disabled={!origin || !destination}
                onPress={calculateRoute}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!origin || !destination) && styles.primaryButtonDisabled,
                  pressed && origin && destination && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {routeState === "error" ? "Try again" : "Pick my walk"}
                </Text>
                <ArrowRight size={19} color={COLORS.white} />
              </Pressable>
            </View>
          ) : null}

          {routeState === "loading" ? (
            <View accessibilityLiveRegion="polite" style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.comfort} />
              <View>
                <Text style={styles.loadingTitle}>Finding your nicer walk...</Text>
                <Text style={styles.loadingSubtitle}>Fastest arrives first, comfort follows.</Text>
              </View>
            </View>
          ) : null}

          {routeState === "success" && !comparison && fastestRoute ? (
            <View style={styles.routeList}>
              <RouteRow
                candidate={temporaryFastestCandidate(fastestRoute)}
                label="Fastest"
                selected
                recommended={false}
                explanation="Checking weather and street exposure..."
              />
            </View>
          ) : null}

          {comparison ? (
            <View style={styles.routeList}>
              <View style={styles.sectionHeadingRow}>
                <View>
                  <Text style={styles.sectionEyebrow}>PICK YOUR WALK</Text>
                  <Text style={styles.sectionTitle}>{routeLabel} for right now</Text>
                </View>
                <Sparkles size={19} color={COLORS.comfort} />
              </View>
              {visibleCandidates.map((candidate) => (
                <RouteRow
                  key={candidate.id}
                  candidate={candidate}
                  label={
                    candidate.role === "fastest"
                      ? "Fastest"
                      : candidate.role === "fastest-and-comfort"
                        ? "Best choice right now"
                        : routeLabel
                  }
                  selected={candidate.id === selectedCandidateId}
                  recommended={candidate.id === comparison.comfort.id}
                  explanation={routeExplanation(candidate, comparison)}
                  onPress={() => selectCandidate(candidate)}
                />
              ))}

              {selectedCandidate ? (
                <View style={styles.detailsSection}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: detailsOpen }}
                    onPress={() => setDetailsOpen((current) => !current)}
                    style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.detailsButtonText}>Why this one?</Text>
                    {detailsOpen ? (
                      <ChevronUp size={19} color={COLORS.ink} />
                    ) : (
                      <ChevronDown size={19} color={COLORS.ink} />
                    )}
                  </Pressable>
                  {detailsOpen ? (
                    <RouteDetails
                      candidate={selectedCandidate}
                      rainCoverQuality={comparison.debug.capabilities?.rainCover}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <Modal
        animationType="fade"
        onRequestClose={() => setInfoOpen(false)}
        statusBarTranslucent
        transparent
        visible={infoOpen}
      >
        <View accessibilityViewIsModal style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Close product information"
            accessibilityRole="button"
            onPress={() => setInfoOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.infoPanel, { paddingBottom: Math.max(insets.bottom, 18) }]}>
            <View style={styles.infoHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>ABOUT</Text>
                <Text style={styles.infoTitle}>Ahhway</Text>
              </View>
              <Pressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                onPress={() => setInfoOpen(false)}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <X size={20} color={COLORS.ink} />
              </Pressable>
            </View>
            <Text style={styles.infoSummary}>
              Compare walking routes using current weather and estimated street exposure.
              Ahhway is not turn-by-turn navigation or safety guidance.
            </Text>
            {[
              { label: "Coverage", path: "/coverage" },
              { label: "Data sources", path: "/data-sources" },
              { label: "Privacy", path: "/privacy" },
              { label: "Terms", path: "/terms" },
              { label: "Support", path: "/support" },
            ].map(({ label, path }) => (
              <Pressable
                accessibilityRole="link"
                key={path}
                onPress={() => openProductInfo(path)}
                style={({ pressed }) => [styles.infoLink, pressed && styles.pressed]}
              >
                <Text style={styles.infoLinkText}>{label}</Text>
                <ArrowRight size={17} color={COLORS.muted} />
              </Pressable>
            ))}
            <Text style={styles.infoVersion}>Version 0.1.0</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function TripEditor({
  origin,
  destination,
  query,
  selectionMode,
  searchState,
  suggestions,
  onFocus,
  onQueryChange,
  onClearQuery,
  onChooseSuggestion,
  onUseCurrentLocation,
}: {
  origin: Place | null;
  destination: Place | null;
  query: string;
  selectionMode: SelectionMode;
  searchState: AsyncState;
  suggestions: PlaceSuggestion[];
  onFocus: (mode: SelectionMode) => void;
  onQueryChange: (value: string) => void;
  onClearQuery: () => void;
  onChooseSuggestion: (suggestion: PlaceSuggestion) => void;
  onUseCurrentLocation: () => void;
}) {
  return (
    <View>
      <View style={styles.editorHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>PLAN A WALK</Text>
          <Text style={styles.editorTitle}>Where to?</Text>
        </View>
        <Pressable
          accessibilityLabel="Use current location as start"
          accessibilityRole="button"
          onPress={onUseCurrentLocation}
          style={({ pressed }) => [styles.useLocationButton, pressed && styles.pressed]}
        >
          <LocateFixed size={17} color={COLORS.ink} />
          <Text style={styles.useLocationText}>My location</Text>
        </Pressable>
      </View>

      <View style={styles.inputsGroup}>
        <PlaceInput
          active={selectionMode === "origin"}
          icon={<View style={styles.pointDotOrigin} />}
          label="Start"
          place={origin}
          query={query}
          onFocus={() => onFocus("origin")}
          onQueryChange={onQueryChange}
          onClearQuery={onClearQuery}
        />
        <View style={styles.inputDivider} />
        <PlaceInput
          active={selectionMode === "destination"}
          icon={<View style={styles.pointDotDestination} />}
          label="Destination"
          place={destination}
          query={query}
          onFocus={() => onFocus("destination")}
          onQueryChange={onQueryChange}
          onClearQuery={onClearQuery}
        />
      </View>

      {query.trim().length >= 2 ? (
        <View style={styles.searchResults}>
          {searchState === "loading" ? (
            <View style={styles.searchMessageRow}>
              <ActivityIndicator color={COLORS.comfort} size="small" />
              <Text style={styles.searchMessage}>Searching nearby...</Text>
            </View>
          ) : null}
          {searchState === "error" ? (
            <Text style={styles.searchError}>Place search is unavailable. Try again.</Text>
          ) : null}
          {searchState === "success" && suggestions.length === 0 ? (
            <Text style={styles.searchMessage}>No matching places found.</Text>
          ) : null}
          {suggestions.slice(0, 5).map((suggestion) => (
            <Pressable
              accessibilityRole="button"
              key={suggestion.id}
              onPress={() => onChooseSuggestion(suggestion)}
              style={({ pressed }) => [styles.suggestionRow, pressed && styles.suggestionPressed]}
            >
              <MapPin size={17} color={COLORS.comfort} />
              <View style={styles.suggestionCopy}>
                <Text numberOfLines={1} style={styles.suggestionName}>
                  {suggestion.name}
                </Text>
                <Text numberOfLines={1} style={styles.suggestionAddress}>
                  {suggestion.address ?? suggestion.category ?? "Place"}
                </Text>
              </View>
              <ArrowRight size={16} color={COLORS.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PlaceInput({
  active,
  icon,
  label,
  place,
  query,
  onFocus,
  onQueryChange,
  onClearQuery,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  place: Place | null;
  query: string;
  onFocus: () => void;
  onQueryChange: (value: string) => void;
  onClearQuery: () => void;
}) {
  return (
    <View style={[styles.inputRow, active && styles.inputRowActive]}>
      <View style={styles.pointIcon}>{icon}</View>
      <View style={styles.inputCopy}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TextInput
          accessibilityLabel={`${label} place search`}
          autoCapitalize="words"
          autoCorrect={false}
          clearButtonMode="never"
          onChangeText={onQueryChange}
          onFocus={onFocus}
          placeholder={label === "Start" ? "Choose a starting point" : "Search a place"}
          placeholderTextColor={COLORS.placeholder}
          returnKeyType="search"
          selectTextOnFocus
          style={styles.textInput}
          value={active && query ? query : place?.name ?? ""}
        />
      </View>
      {active && query ? (
        <Pressable
          accessibilityLabel={`Clear ${label.toLowerCase()} search`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onClearQuery}
          style={styles.clearButton}
        >
          <X size={17} color={COLORS.muted} />
        </Pressable>
      ) : (
        <Search size={17} color={COLORS.muted} />
      )}
    </View>
  );
}

function RouteRow({
  candidate,
  label,
  selected,
  recommended,
  explanation,
  onPress,
}: {
  candidate: RouteCandidate;
  label: string;
  selected: boolean;
  recommended: boolean;
  explanation: string;
  onPress?: () => void;
}) {
  const isComfort = candidate.role === "comfort" || candidate.role === "fastest-and-comfort";
  const accessibilityLabel = [
    label,
    formatDuration(candidate.route.durationSeconds),
    formatDistance(candidate.route.distanceMeters),
    recommended ? "recommended" : null,
    explanation,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Pressable
      accessibilityHint={onPress ? "Selects this walking route" : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={{ selected }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.routeRow,
        selected && styles.routeRowSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.routeIcon, isComfort && styles.routeIconComfort]}>
        {isComfort ? (
          <Gauge size={17} color={COLORS.comfort} />
        ) : (
          <Clock3 size={17} color={COLORS.ink} />
        )}
      </View>
      <View style={styles.routeCopy}>
        <View style={styles.routeLabelRow}>
          <Text numberOfLines={1} style={styles.routeLabel}>
            {label}
          </Text>
          {recommended ? <Text style={styles.recommendedLabel}>RECOMMENDED</Text> : null}
        </View>
        <Text numberOfLines={2} style={styles.routeExplanation}>
          {explanation}
        </Text>
      </View>
      <View style={styles.routeTiming}>
        <Text style={styles.routeDuration}>{formatDuration(candidate.route.durationSeconds)}</Text>
        <Text style={styles.routeDistance}>{formatDistance(candidate.route.distanceMeters)}</Text>
      </View>
      <View style={[styles.selectionMark, selected && styles.selectionMarkSelected]}>
        {selected ? <Check size={14} color={COLORS.white} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

function RouteDetails({
  candidate,
  rainCoverQuality,
}: {
  candidate: RouteCandidate;
  rainCoverQuality: CapabilityQuality | undefined;
}) {
  const comfort = candidate.comfortAnalysis;
  const cost = comfort?.routeComfortCost;
  const score = comfort?.summary.comfortScore;
  const metrics = [
    {
      label: "Comfort score",
      value: typeof score === "number" ? `${Math.round(score)}/100` : "Limited",
    },
    { label: "Confidence", value: formatPercent(cost?.confidence) },
    { label: "Completeness", value: formatPercent(cost?.completeness) },
    {
      label: "Building shade",
      value: formatPercent(candidate.shadeAnalysis?.summary.shadeRatio),
    },
    {
      label: "Wind exposure",
      value:
        typeof candidate.windAnalysis?.summary.averageEstimatedExposureMps === "number"
          ? `${candidate.windAnalysis.summary.averageEstimatedExposureMps.toFixed(1)} m/s`
          : "Unavailable",
    },
    {
      label: "Covered distance",
      value: formatCoveredDistance(candidate, rainCoverQuality),
    },
    {
      label: "Direct sun",
      value: formatPercent(candidate.heatAnalysis?.summary.directSunRatio),
    },
    {
      label: "Snow exposure",
      value:
        typeof candidate.snowAnalysis?.summary.averageSnowfallExposure === "number"
          ? candidate.snowAnalysis.summary.averageSnowfallExposure.toFixed(2)
          : "Unavailable",
    },
  ];

  return (
    <View style={styles.metricsGrid}>
      {metrics.map((metric) => (
        <View key={metric.label} style={styles.metricCell}>
          <Text style={styles.metricLabel}>{metric.label}</Text>
          <Text style={styles.metricValue}>{metric.value}</Text>
        </View>
      ))}
      <Text style={styles.disclaimer}>
        Environmental estimates are not safety guidance. Conditions, shade, ice, and path access
        can change.
      </Text>
    </View>
  );
}

function temporaryFastestCandidate(route: RouteResult): RouteCandidate {
  return {
    id: "fastest-pending",
    role: "fastest",
    status: "partial",
    route,
    metrics: {
      extraDurationSeconds: 0,
      environmentalCostReductionRatio: 0,
    },
  };
}

function coordinatePlace(coordinate: Coordinate, name: string): Place {
  return {
    id: `coordinate:${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`,
    name,
    address: `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`,
    coordinate,
  };
}

function createSessionToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Operation timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.mapFallback },
  keyboardLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "flex-end",
  },
  brandBar: {
    position: "absolute",
    left: 12,
    right: 64,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    ...SHADOW,
  },
  infoButton: {
    position: "absolute",
    right: 12,
    width: 44,
    height: 52,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    ...SHADOW,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.ink,
  },
  brandMarkImage: { width: 36, height: 36, borderRadius: 6 },
  brandCopy: { width: 72, paddingHorizontal: 8, gap: 3 },
  brandName: { color: COLORS.ink, fontSize: 17, fontWeight: "800" },
  brandSignal: { width: 22, height: 3, backgroundColor: COLORS.signal, borderRadius: 2 },
  weatherDivider: { width: StyleSheet.hairlineWidth, height: 30, backgroundColor: COLORS.border },
  weatherCopy: { flex: 1, paddingLeft: 10 },
  weatherPrimary: { color: COLORS.ink, fontSize: 13, fontWeight: "700" },
  weatherSecondary: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  locationButton: {
    position: "absolute",
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    ...SHADOW,
  },
  locationButtonDisabled: { opacity: 0.72 },
  pressed: { opacity: 0.68 },
  sheet: {
    maxHeight: "72%",
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: COLORS.border,
    ...SHADOW,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    alignSelf: "center",
    borderRadius: 2,
    backgroundColor: COLORS.borderStrong,
    marginBottom: 10,
  },
  sheetScroll: { flexGrow: 0 },
  editorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionEyebrow: { color: COLORS.muted, fontSize: 10, fontWeight: "800" },
  editorTitle: { color: COLORS.ink, fontSize: 22, fontWeight: "800", marginTop: 2 },
  useLocationButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: COLORS.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  useLocationText: { color: COLORS.ink, fontSize: 12, fontWeight: "700" },
  inputsGroup: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    backgroundColor: COLORS.white,
  },
  inputRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 9,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  inputRowActive: { backgroundColor: COLORS.focusSurface, borderLeftColor: COLORS.focus },
  pointIcon: { width: 16, alignItems: "center" },
  pointDotOrigin: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.origin },
  pointDotDestination: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: COLORS.destination,
  },
  inputCopy: { flex: 1 },
  inputLabel: { color: COLORS.muted, fontSize: 10, fontWeight: "700" },
  textInput: { color: COLORS.ink, fontSize: 15, fontWeight: "600", paddingVertical: 4 },
  inputDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: 38 },
  clearButton: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  searchResults: { marginTop: 8, maxHeight: 276 },
  searchMessageRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 9 },
  searchMessage: { color: COLORS.muted, fontSize: 13 },
  searchError: { color: COLORS.alert, fontSize: 13, paddingVertical: 12 },
  suggestionRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  suggestionPressed: { backgroundColor: COLORS.surface },
  suggestionCopy: { flex: 1 },
  suggestionName: { color: COLORS.ink, fontSize: 14, fontWeight: "700" },
  suggestionAddress: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  actionArea: { marginTop: 10 },
  mapHint: { color: COLORS.muted, fontSize: 11, marginBottom: 9 },
  primaryButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 6,
    backgroundColor: COLORS.ink,
  },
  primaryButtonDisabled: { backgroundColor: COLORS.disabled },
  primaryButtonPressed: { backgroundColor: COLORS.comfortDark },
  primaryButtonText: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
  tripSummaryRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tripSummaryButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 6,
  },
  tripSummaryText: { flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: "700" },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 9,
    padding: 9,
    backgroundColor: COLORS.alertSurface,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.alert,
  },
  alertText: { flex: 1, color: COLORS.alertText, fontSize: 12, fontWeight: "600" },
  noticeText: {
    color: COLORS.noticeText,
    backgroundColor: COLORS.noticeSurface,
    fontSize: 12,
    padding: 9,
    marginTop: 8,
  },
  loadingRow: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  loadingTitle: { color: COLORS.ink, fontSize: 14, fontWeight: "800" },
  loadingSubtitle: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  routeList: { marginTop: 10 },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  sectionTitle: { color: COLORS.ink, fontSize: 17, fontWeight: "800", marginTop: 2 },
  routeRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 10,
    paddingHorizontal: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  routeRowSelected: {
    backgroundColor: COLORS.comfortSurface,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.comfort,
  },
  routeIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },
  routeIconComfort: { backgroundColor: COLORS.comfortIconSurface },
  routeCopy: { flex: 1, minWidth: 0 },
  routeLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  routeLabel: { flexShrink: 1, color: COLORS.ink, fontSize: 14, fontWeight: "800" },
  recommendedLabel: { color: COLORS.comfortDark, fontSize: 8, fontWeight: "900" },
  routeExplanation: { color: COLORS.muted, fontSize: 11, lineHeight: 15, marginTop: 3 },
  routeTiming: { alignItems: "flex-end", width: 58 },
  routeDuration: { color: COLORS.ink, fontSize: 14, fontWeight: "800" },
  routeDistance: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  selectionMark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionMarkSelected: { backgroundColor: COLORS.comfort, borderColor: COLORS.comfort },
  detailsSection: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  detailsButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 5,
  },
  detailsButtonText: { color: COLORS.ink, fontSize: 13, fontWeight: "800" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", paddingBottom: 8 },
  metricCell: { width: "50%", paddingVertical: 6, paddingHorizontal: 5 },
  metricLabel: { color: COLORS.muted, fontSize: 10 },
  metricValue: { color: COLORS.ink, fontSize: 13, fontWeight: "800", marginTop: 2 },
  disclaimer: {
    width: "100%",
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 14,
    paddingHorizontal: 5,
    paddingTop: 6,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(23, 38, 43, 0.38)",
  },
  infoPanel: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  infoTitle: { color: COLORS.ink, fontSize: 24, fontWeight: "800", marginTop: 2 },
  infoSummary: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  infoLink: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  infoLinkText: { color: COLORS.ink, fontSize: 14, fontWeight: "700" },
  infoVersion: { color: COLORS.muted, fontSize: 11, marginTop: 12 },
});
