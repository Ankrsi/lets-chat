import axios from "axios";
import { ApiError } from "../utils/apiError";

// Cloudflare Realtime TURN: short-lived credentials per user, so the API token never leaves the server
const DEFAULT_TTL = 24 * 60 * 60; // seconds

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export const generateIceServers = async (): Promise<{ iceServers: IceServer[]; ttl: number }> => {
  const { CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_API_TOKEN } = process.env;
  if (!CLOUDFLARE_TURN_KEY_ID || !CLOUDFLARE_TURN_API_TOKEN) throw new ApiError("TURN is not configured", 500);
  const ttl = Number(process.env.TURN_TTL_SECONDS || DEFAULT_TTL);

  const { data } = await axios
    .post(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`,
      { ttl },
      { headers: { Authorization: `Bearer ${CLOUDFLARE_TURN_API_TOKEN}` }, timeout: 10_000 },
    )
    .catch((err) => {
      console.error("Cloudflare TURN error:", err?.response?.status, err?.response?.data || err.message);
      throw new ApiError("Could not get call servers", 502);
    });

  // Cloudflare also lists port-53 URLs, which many networks block; dropping them avoids slow ICE timeouts
  const iceServers: IceServer[] = (data?.iceServers ?? []).map((s: IceServer) => {
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u));
    return { ...s, urls };
  }).filter((s: IceServer) => (s.urls as string[]).length);

  if (!iceServers.length) throw new ApiError("Could not get call servers", 502);
  return { iceServers, ttl };
};
