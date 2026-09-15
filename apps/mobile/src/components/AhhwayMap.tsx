import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, {
  Marker,
  Polyline,
  type LongPressEvent,
  type Region,
} from "react-native-maps";
import { COLORS } from "../theme";
import type { Coordinate, RouteCandidate } from "../types";

const INITIAL_REGION: Region = {
  latitude: 44.9778,
  longitude: -93.265,
  latitudeDelta: 0.055,
  longitudeDelta: 0.055,
};

export function AhhwayMap({
  origin,
  destination,
  candidates,
  selectedCandidateId,
  focusCoordinate,
  userCoordinate,
  onLongPress,
  onCenterChange,
}: {
  origin: Coordinate | null;
  destination: Coordinate | null;
  candidates: RouteCandidate[];
  selectedCandidateId: string | null;
  focusCoordinate: Coordinate | null;
  userCoordinate: Coordinate | null;
  onLongPress: (coordinate: Coordinate) => void;
  onCenterChange: (coordinate: Coordinate) => void;
}) {
  const map = useRef<MapView | null>(null);
  const routeCoordinates = useMemo(
    () =>
      candidates.flatMap((candidate) =>
        candidate.route.geometry.coordinates.map(([longitude, latitude]) => ({
          latitude,
          longitude,
        })),
      ),
    [candidates],
  );

  useEffect(() => {
    if (routeCoordinates.length <= 1) return;
    map.current?.fitToCoordinates(routeCoordinates, {
      animated: true,
      edgePadding: { top: 120, right: 46, bottom: 360, left: 46 },
    });
  }, [routeCoordinates]);

  useEffect(() => {
    if (!focusCoordinate || routeCoordinates.length > 1) return;
    map.current?.animateCamera({ center: focusCoordinate, zoom: 15 }, { duration: 450 });
  }, [focusCoordinate, routeCoordinates.length]);

  function handleLongPress(event: LongPressEvent) {
    onLongPress(event.nativeEvent.coordinate);
  }

  return (
    <View style={styles.container}>
      <MapView
        accessibilityHint="Press and hold to place the active trip point"
        accessibilityLabel="Walking route map"
        initialRegion={INITIAL_REGION}
        mapPadding={{ top: 92, right: 8, bottom: 290, left: 8 }}
        onLongPress={handleLongPress}
        onRegionChangeComplete={(region) =>
          onCenterChange({ latitude: region.latitude, longitude: region.longitude })
        }
        ref={map}
        rotateEnabled={false}
        showsCompass={false}
        showsMyLocationButton={false}
        showsPointsOfInterests
        showsUserLocation={Boolean(userCoordinate)}
        style={styles.map}
      >
        {candidates.map((candidate) => {
          const selected = candidate.id === selectedCandidateId || candidates.length === 1;
          return (
            <Polyline
              coordinates={candidate.route.geometry.coordinates.map(([longitude, latitude]) => ({
                latitude,
                longitude,
              }))}
              key={candidate.id}
              lineCap="round"
              lineJoin="round"
              strokeColor={selected ? COLORS.comfort : COLORS.muted}
              strokeWidth={selected ? 6 : 3}
              zIndex={selected ? 3 : 1}
            />
          );
        })}
        {origin ? (
          <Marker coordinate={origin} identifier="origin" title="Start">
            <View style={styles.originMarker} />
          </Marker>
        ) : null}
        {destination ? (
          <Marker coordinate={destination} identifier="destination" title="Destination">
            <View style={styles.destinationMarker} />
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.mapFallback },
  map: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  originMarker: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: COLORS.origin,
    borderWidth: 4,
    borderColor: COLORS.white,
  },
  destinationMarker: {
    width: 19,
    height: 19,
    borderRadius: 5,
    backgroundColor: COLORS.destination,
    borderWidth: 4,
    borderColor: COLORS.white,
  },
});
