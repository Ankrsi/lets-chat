import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthAPI } from "./api";

// TURN credentials for 1:1 calls come from auth-service (Cloudflare), never from the app bundle.
type IceServer = { urls: string | string[]; username?: string; credential?: string };
type Cached = { iceServers: IceServer[]; expiresAt: number };

const STORAGE_KEY = "turnIceServers";
const REFRESH_BEFORE_MS = 10 * 60 * 1000; // renew 10 minutes before they expire
const STUN_ONLY: IceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];

let cached: Cached | null = null;
let inFlight: Promise<Cached | null> | null = null;

const fresh = (c: Cached | null) => !!c && c.expiresAt - Date.now() > REFRESH_BEFORE_MS;
const usable = (c: Cached | null) => !!c && c.expiresAt > Date.now();

const fetchCredentials = async (): Promise<Cached | null> => {
  try {
    const res = await AuthAPI.get("/auth/turn-credentials");
    const next: Cached = { iceServers: res.data.iceServers, expiresAt: new Date(res.data.expiresAt).getTime() };
    cached = next;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
    return next;
  } catch (err) {
    console.info("TURN credentials fetch failed", err);
    return null;
  }
};

export const refreshTurnCredentials = async (): Promise<void> => {
  if (!cached) {
    const stored = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    if (stored) {
      try { cached = JSON.parse(stored); } catch { cached = null; }
    }
  }
  if (fresh(cached)) return;
  inFlight ??= fetchCredentials().finally(() => { inFlight = null; });
  await inFlight;
};

export const getIceServers = async (): Promise<{ iceServers: IceServer[]; hasTurn: boolean }> => {
  await refreshTurnCredentials();
  if (usable(cached)) return { iceServers: cached!.iceServers, hasTurn: true };
  // No TURN available (offline / server error): try direct connection rather than failing the call
  return { iceServers: STUN_ONLY, hasTurn: false };
};

export const clearTurnCredentials = async () => {
  cached = null;
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
};
