import * as Location from "expo-location";
import { Alert, Linking } from "react-native";

export interface SharedLocation {
  lat: number;
  lng: number;
  accuracy: number | null; // metres
  address: string | null;
}

export async function ensureLocationAccess(): Promise<boolean> {
  let perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== "granted" && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== "granted") {
    Alert.alert(
      "Location permission needed",
      "Allow location access to share where you are.",
      perm.canAskAgain
        ? [{ text: "OK" }]
        : [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }],
    );
    return false;
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    Alert.alert("Location is off", "Turn on location services to share your current location.");
    return false;
  }
  return true;
}

const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T) =>
  Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

export async function getCurrentLocation(): Promise<SharedLocation> {
  const fresh = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null),
    12000,
    null,
  );
  const pos = fresh ?? (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }));
  if (!pos) throw new Error("Couldn't get your location. Try again, preferably outdoors or near a window.");
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  return { lat, lng, accuracy: accuracy ?? null, address: await addressFor(lat, lng) };
}

export async function addressFor(lat: number, lng: number): Promise<string | null> {
  try {
    const [place] = await withTimeout(Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }), 4000, []);
    if (!place) return null;
    return [place.name && place.name !== place.street ? place.name : null, place.street, place.city || place.subregion]
      .filter(Boolean).join(", ") || null;
  } catch {
    return null;
  }
}

export const distanceMetres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
