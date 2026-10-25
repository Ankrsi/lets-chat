import { colors, radius } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import StaticMap from "./StaticMap";

interface Props {
  /** Message content: { lat, lng, address?, accuracy? } — older messages only have msg: "lat,lng". */
  content: any;
  /** Long press on the card (message options) */
  onLongPress?: () => void;
}

/** Coordinates from new ({ lat, lng }) or old ({ msg: "lat,lng" }) location messages. */
export const parseLocation = (content: any): { lat: number; lng: number } | null => {
  const lat = Number(content?.lat ?? String(content?.msg ?? "").split(",")[0]);
  const lng = Number(content?.lng ?? String(content?.msg ?? "").split(",")[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

/** Opens the phone's maps app at the point (falls back to Google Maps in the browser). */
export async function openInMaps(lat: number, lng: number, label = "Shared location") {
  const q = encodeURIComponent(label);
  const native = Platform.OS === "ios"
    ? `maps://?ll=${lat},${lng}&q=${q}`
    : `geo:${lat},${lng}?q=${lat},${lng}(${q})`;
  const web = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  try {
    await Linking.openURL(native);
  } catch {
    Linking.openURL(web).catch(() => Alert.alert("Couldn't open maps"));
  }
}

// Drawn map tile: soft land, a few roads and a pin — no map service or API key needed
function MapTile() {
  return (
    <View style={styles.map}>
      <View style={[styles.road, { top: "38%", left: -20, right: -20, transform: [{ rotate: "-8deg" }] }]} />
      <View style={[styles.road, styles.roadThin, { top: "70%", left: -20, right: -20, transform: [{ rotate: "6deg" }] }]} />
      <View style={[styles.road, { top: -20, bottom: -20, left: "62%", width: 10, height: undefined, transform: [{ rotate: "12deg" }] }]} />
      <View style={[styles.park, { top: 10, left: 14 }]} />
      <View style={[styles.water, { bottom: 8, right: 10 }]} />
      <View style={styles.pinWrap}>
        <View style={styles.pinPulse} />
        <Ionicons name="location" size={34} color={colors.danger} />
      </View>
    </View>
  );
}

export default function LocationCard({ content, onLongPress }: Props) {
  const point = parseLocation(content);
  if (!point) {
    return <Text style={styles.invalid}>📍 Location unavailable</Text>;
  }
  const title = content?.address || "Shared location";
  const coords = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  const accuracy = Number(content?.accuracy);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => openInMaps(point.lat, point.lng, title)} onLongPress={onLongPress} style={styles.card}>
      {/* Real map; the drawn tile stands in when map tiles can't load (offline) */}
      <StaticMap lat={point.lat} lng={point.lng} zoom={15} width={240} height={130} fallback={<MapTile />} />
      <View style={styles.footer}>
        <View style={styles.footerIcon}>
          <Ionicons name="navigate" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <Text style={styles.coords} numberOfLines={1}>
            {coords}{Number.isFinite(accuracy) && accuracy > 0 ? ` · ±${Math.round(accuracy)} m` : ""}
          </Text>
        </View>
      </View>
      <View style={styles.openRow}>
        <Text style={styles.openText}>Open in Maps</Text>
        <Ionicons name="open-outline" size={14} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { width: 240, borderRadius: 14, overflow: "hidden", backgroundColor: colors.surface },
  map: { height: 130, backgroundColor: "#E8EEF6", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  road: { position: "absolute", height: 10, backgroundColor: "#FFFFFF", borderRadius: 5 },
  roadThin: { height: 6, backgroundColor: "#F8FAFC" },
  park: { position: "absolute", width: 54, height: 34, borderRadius: 10, backgroundColor: "#D1FAE5" },
  water: { position: "absolute", width: 70, height: 30, borderRadius: 15, backgroundColor: "#DBEAFE" },
  pinWrap: { alignItems: "center", justifyContent: "flex-end", height: 50 },
  pinPulse: {
    position: "absolute",
    bottom: 0,
    width: 18,
    height: 8,
    borderRadius: 9,
    backgroundColor: "rgba(239,68,68,0.25)",
  },
  footer: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingTop: 10 },
  footerIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 14, fontWeight: "700", color: colors.text },
  coords: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  openRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  openText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  invalid: { fontSize: 14, color: colors.textSecondary },
});
