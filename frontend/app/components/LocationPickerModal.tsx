import { colors, radius, shadow } from "@/theme";
import { addressFor, distanceMetres, getCurrentLocation, SharedLocation } from "@/utils/location";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Modal, PanResponder, StatusBar, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import StaticMap, { fromPixel, toPixel } from "./StaticMap";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSend: (location: SharedLocation) => void;
}

const MIN_ZOOM = 3;
const MAX_ZOOM = 19;

/**
 * WhatsApp-style "Send location": a draggable map (pin fixed in the centre), your position as a
 * blue dot, and two choices — your current location, or the place you moved the map to.
 */
export default function LocationPickerModal({ visible, onClose, onSend }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const mapHeight = Math.round(height * 0.52);

  const [current, setCurrent] = useState<SharedLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState(17);
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const [picked, setPicked] = useState<{ lat: number; lng: number; address: string | null; resolving: boolean } | null>(null);

  // Latest values for the pan handlers (created once)
  const live = useRef({ center, zoom });
  live.current = { center, zoom };

  const locate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loc = await getCurrentLocation();
      setCurrent(loc);
      setCenter({ lat: loc.lat, lng: loc.lng });
      setPicked(null);
    } catch (err: any) {
      setError(err?.message || "Couldn't get your location.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fresh fix each time the sheet opens
  useEffect(() => {
    if (visible) {
      setCurrent(null);
      setCenter(null);
      setPicked(null);
      setZoom(17);
      locate();
    }
  }, [visible, locate]);

  // Address of the spot under the pin, after the map stops moving
  const resolvePicked = useCallback(async (lat: number, lng: number) => {
    setPicked({ lat, lng, address: null, resolving: true });
    const address = await addressFor(lat, lng);
    setPicked((p) => (p && p.lat === lat && p.lng === lng ? { ...p, address, resolving: false } : p));
  }, []);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !!live.current.center,
    onMoveShouldSetPanResponder: (_, g) => !!live.current.center && (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
    onPanResponderMove: (_, g) => setDrag({ dx: g.dx, dy: g.dy }),
    onPanResponderRelease: (_, g) => {
      const { center: c, zoom: z } = live.current;
      setDrag({ dx: 0, dy: 0 });
      if (!c || (Math.abs(g.dx) < 3 && Math.abs(g.dy) < 3)) return;
      const p = toPixel(c.lat, c.lng, z);
      const next = fromPixel(p.x - g.dx, p.y - g.dy, z);
      setCenter(next);
      resolvePicked(next.lat, next.lng);
    },
    onPanResponderTerminate: () => setDrag({ dx: 0, dy: 0 }),
  }), [resolvePicked]);

  // Centre shown while dragging
  const shownCenter = useMemo(() => {
    if (!center) return null;
    if (!drag.dx && !drag.dy) return center;
    const p = toPixel(center.lat, center.lng, zoom);
    return fromPixel(p.x - drag.dx, p.y - drag.dy, zoom);
  }, [center, drag, zoom]);

  const recenter = () => {
    if (!current) return;
    setCenter({ lat: current.lat, lng: current.lng });
    setPicked(null);
  };

  // "Send this location" only when the map is away from where you are
  const movedAway = !!(current && picked && distanceMetres(current, picked) > 15);

  const send = (loc: SharedLocation) => {
    onSend(loc);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={8} accessibilityLabel="Close">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send location</Text>
          <TouchableOpacity style={styles.headerBtn} onPress={locate} hitSlop={8} accessibilityLabel="Refresh location" disabled={loading}>
            <Ionicons name="refresh" size={22} color={loading ? colors.textMuted : colors.text} />
          </TouchableOpacity>
        </View>

        {/* Map */}
        <View style={{ width, height: mapHeight }} {...pan.panHandlers}>
          {shownCenter ? (
            <StaticMap
              lat={shownCenter.lat}
              lng={shownCenter.lng}
              zoom={zoom}
              width={width}
              height={mapHeight}
              userLocation={current}
            />
          ) : (
            <View style={[styles.mapPlaceholder, { height: mapHeight }]}>
              {loading ? <ActivityIndicator color={colors.primary} size="large" /> : (
                <Ionicons name="map-outline" size={48} color={colors.primaryMuted} />
              )}
            </View>
          )}

          {!!center && (
            <View style={styles.mapControls} pointerEvents="box-none">
              <View style={styles.zoomBox}>
                <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))} accessibilityLabel="Zoom in">
                  <Ionicons name="add" size={22} color={colors.text} />
                </TouchableOpacity>
                <View style={styles.zoomDivider} />
                <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))} accessibilityLabel="Zoom out">
                  <Ionicons name="remove" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.roundBtn} onPress={recenter} accessibilityLabel="Go to my location">
                <Ionicons name="locate" size={22} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Choices */}
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          {loading && !current && (
            <View style={styles.row}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.rowSub}>Finding your location…</Text>
            </View>
          )}

          {!!error && !current && (
            <TouchableOpacity style={styles.row} onPress={locate}>
              <View style={[styles.rowIcon, { backgroundColor: colors.dangerSoft }]}>
                <Ionicons name="warning-outline" size={20} color={colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{error}</Text>
                <Text style={styles.rowSub}>Tap to try again</Text>
              </View>
            </TouchableOpacity>
          )}

          {current && (
            <TouchableOpacity style={styles.row} onPress={() => send(current)} activeOpacity={0.6}>
              <View style={[styles.rowIcon, { backgroundColor: colors.primary }]}>
                <Ionicons name="navigate" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Send your current location</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {current.accuracy ? `Accurate to ${Math.round(current.accuracy)} metres` : current.address || "Your location"}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {movedAway && picked && (
            <TouchableOpacity
              style={styles.row}
              onPress={() => send({ lat: picked.lat, lng: picked.lng, accuracy: null, address: picked.address })}
              activeOpacity={0.6}
            >
              <View style={[styles.rowIcon, { backgroundColor: colors.dangerSoft }]}>
                <Ionicons name="location" size={20} color={colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Send this location</Text>
                <Text style={styles.rowSub} numberOfLines={2}>
                  {picked.resolving ? "Looking up address…" : picked.address || `${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}`}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {current && <Text style={styles.hint}>Drag the map to choose another place</Text>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 19, fontWeight: "800", color: colors.text, marginLeft: 4 },

  mapPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: "#E8EEF6" },
  mapControls: { position: "absolute", right: 12, bottom: 16, alignItems: "flex-end", gap: 10 },
  zoomBox: { backgroundColor: colors.surface, borderRadius: radius.md, ...shadow(2) },
  zoomBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  zoomDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 8 },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow(2),
  },

  sheet: { flex: 1, paddingTop: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 14 },
  rowIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  rowSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: 8 },
});
