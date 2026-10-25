import { colors } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export const TILE = 256;
// OpenStreetMap's tile policy asks apps to identify themselves; tiles are also cached on disk
const TILE_HEADERS = { "User-Agent": "LetsChat/1.0 (chat app location preview)" };

/* ---------------- Web Mercator ---------------- */

/** Position in global pixels at a zoom level. */
export const toPixel = (lat: number, lng: number, zoom: number) => {
  const scale = TILE * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
};

/** Global pixels back to coordinates. */
export const fromPixel = (x: number, y: number, zoom: number) => {
  const scale = TILE * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI * (1 - (2 * y) / scale);
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return { lat: Math.max(-85, Math.min(85, lat)), lng: ((((lng + 180) % 360) + 360) % 360) - 180 };
};

const metresPerPixel = (lat: number, zoom: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

/* ---------------- map ---------------- */

interface Props {
  /** Map centre */
  lat: number;
  lng: number;
  width: number;
  height: number;
  zoom?: number;
  /** Red pin at the centre (the location being shown or picked) */
  centerPin?: boolean;
  /** Blue "you are here" dot with an accuracy circle */
  userLocation?: { lat: number; lng: number; accuracy?: number | null } | null;
  /** Shown instead of the map when tiles can't load (offline, blocked) */
  fallback?: React.ReactNode;
}

/**
 * A real map without a native map module: the OpenStreetMap tiles around the centre,
 * positioned in pixels, with markers on top.
 */
export default function StaticMap({ lat, lng, width, height, zoom = 16, centerPin = true, userLocation, fallback }: Props) {
  const [failed, setFailed] = useState(false);
  if (failed && fallback) return <>{fallback}</>;

  const center = toPixel(lat, lng, zoom);
  const originX = center.x - width / 2;
  const originY = center.y - height / 2;
  const tilesPerSide = 2 ** zoom;

  const tiles: { key: string; uri: string; left: number; top: number }[] = [];
  for (let ty = Math.floor(originY / TILE); ty <= Math.floor((originY + height) / TILE); ty++) {
    if (ty < 0 || ty >= tilesPerSide) continue;
    for (let tx = Math.floor(originX / TILE); tx <= Math.floor((originX + width) / TILE); tx++) {
      const wrappedX = ((tx % tilesPerSide) + tilesPerSide) % tilesPerSide;
      tiles.push({
        key: `${zoom}/${tx}/${ty}`,
        uri: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png`,
        left: tx * TILE - originX,
        top: ty * TILE - originY,
      });
    }
  }

  // "You are here", relative to the current centre
  let user: { x: number; y: number; r: number } | null = null;
  if (userLocation) {
    const p = toPixel(userLocation.lat, userLocation.lng, zoom);
    const r = userLocation.accuracy ? Math.min(userLocation.accuracy / metresPerPixel(userLocation.lat, zoom), 400) : 0;
    user = { x: p.x - originX, y: p.y - originY, r };
  }

  return (
    <View style={[styles.map, { width, height }]} pointerEvents="none">
      {tiles.map((t) => (
        <Image
          key={t.key}
          source={{ uri: t.uri, headers: TILE_HEADERS }}
          style={{ position: "absolute", left: t.left, top: t.top, width: TILE, height: TILE }}
          cachePolicy="disk"
          transition={120}
          onError={() => setFailed(true)}
        />
      ))}

      {user && user.r > 8 && (
        <View style={[styles.accuracy, { width: user.r * 2, height: user.r * 2, borderRadius: user.r, left: user.x - user.r, top: user.y - user.r }]} />
      )}
      {user && <View style={[styles.userDot, { left: user.x - 9, top: user.y - 9 }]} />}

      {centerPin && (
        <>
          <View style={[styles.pinShadow, { left: width / 2 - 6, top: height / 2 - 3 }]} />
          {/* tip of the icon sits on the centre */}
          <View style={[styles.pin, { left: width / 2 - 20, top: height / 2 - 40 }]}>
            <Ionicons name="location" size={40} color={colors.danger} />
          </View>
        </>
      )}

      <Text style={styles.attribution}>© OpenStreetMap</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { overflow: "hidden", backgroundColor: "#E8EEF6" },
  accuracy: {
    position: "absolute",
    backgroundColor: "rgba(59,130,246,0.14)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.4)",
  },
  userDot: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#3B82F6",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  pin: { position: "absolute", width: 40, height: 40, alignItems: "center" },
  pinShadow: { position: "absolute", width: 12, height: 6, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.25)" },
  attribution: {
    position: "absolute",
    right: 4,
    bottom: 2,
    fontSize: 9,
    color: "#475569",
    backgroundColor: "rgba(255,255,255,0.75)",
    paddingHorizontal: 4,
    borderRadius: 3,
    overflow: "hidden",
  },
});
