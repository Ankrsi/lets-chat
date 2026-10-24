import axios from "axios";
import { createClient } from "redis";
import { redisClient } from "./redisClient";

/**
 * Drives sequential ride dispatch — the "25 seconds are up, offer the ride to
 * the next driver" signal.
 *
 * riding-service sets `ride_offer_timer:{rideId}` with a short TTL every time it
 * offers a ride to a driver. When Redis expires that key it publishes a keyspace
 * event, we pick it up here and tell riding-service to advance the queue.
 * riding-service arms a fresh timer, so the loop drives itself with no cron and
 * nothing held in Node memory (a riding-service restart cannot break a ride in
 * flight).
 *
 * DELIBERATELY ISOLATED: this uses its OWN Redis connection and its own
 * pSubscribe rather than extending the existing expired-key handler in
 * socket/index.ts (which belongs to chat's disappearing/destructing messages).
 * Redis delivers keyspace events to every subscriber independently, so the two
 * run side by side and neither can affect the other. Chat keys are ignored here
 * by the prefix check, and chat's handler ignores ours the same way.
 *
 * Requires `notify-keyspace-events` to include `Ex` on the Redis server — which
 * is already the case, since chat's disappearing messages depend on it.
 */

const TIMER_KEY_PREFIX = "ride_offer_timer:";
const EXPIRED_EVENT_PATTERN = "__keyevent@0__:expired";

// Guards against a duplicate advance when more than one conversation-service
// replica is running: every replica receives the same expiry event, but only
// the one that wins this SET NX calls riding-service. Kept below the offer
// timeout so it always clears before the next tick.
const DISPATCH_LOCK_SECONDS = 20;

const reconnectStrategy = (retries: number) => {
  if (retries >= 20) {
    return new Error(`Redis: stopped reconnecting after ${retries} retries`);
  }
  return Math.min(retries * 50, 2000);
};

/** Warn loudly if keyspace expiry events are off — dispatch silently stalls without them. */
const verifyKeyspaceEventsEnabled = async () => {
  try {
    // Read-only check. We never CONFIG SET here: overwriting the flags could
    // break chat's disappearing messages, which rely on the same setting.
    const config = (await redisClient.sendCommand([
      "CONFIG",
      "GET",
      "notify-keyspace-events",
    ])) as unknown as string[];

    const flags = Array.isArray(config) ? String(config[1] ?? "") : "";

    if (!flags.includes("E") || !(flags.includes("x") || flags.includes("A"))) {
      console.error(
        `⚠️ [rideOfferExpiry] Redis notify-keyspace-events is "${flags}" — expiry events (Ex) are NOT enabled. Sequential ride dispatch will stall after the first driver.`
      );
      return;
    }

    console.info(`✅ [rideOfferExpiry] keyspace expiry events enabled (flags="${flags}")`);
  } catch (err: any) {
    // Managed Redis often blocks CONFIG GET — not fatal, just unverifiable.
    console.info(
      `ℹ️ [rideOfferExpiry] could not verify notify-keyspace-events: ${err?.message}`
    );
  }
};

const advanceRideQueue = async (rideId: string) => {
  const baseUrl = process.env.RIDING_SERVICE_BASE_URL;

  if (!baseUrl) {
    console.error(
      `❌ [rideOfferExpiry] RIDING_SERVICE_BASE_URL not configured — ride ${rideId} cannot advance to the next driver`
    );
    return;
  }

  // Only one replica proceeds per tick.
  const lock = await redisClient.set(`ride_dispatch_lock:${rideId}`, "1", {
    NX: true,
    EX: DISPATCH_LOCK_SECONDS,
  });

  if (lock !== "OK") {
    console.info(`🔒 [rideOfferExpiry] ride ${rideId} already being advanced elsewhere — skipping`);
    return;
  }

  try {
    const { data } = await axios.post(
      `${baseUrl.replace(/\/$/, "")}/api/v1/riding/internal/dispatch-next`,
      { rideId },
      {
        headers: { "x-internal-api-key": process.env.INTERNAL_API_KEY || "" },
        timeout: 10000,
      }
    );

    console.info(`➡️ [rideOfferExpiry] advanced ride ${rideId}:`, data?.data ?? data);
  } catch (err: any) {
    console.error(
      `❌ [rideOfferExpiry] dispatch-next failed for ride ${rideId}: ${err?.response?.data?.message || err?.message}`
    );
  }
};

export const startRideOfferExpirySubscriber = async () => {
  const rideSubscriber = createClient({
    url: process.env.REDIS_URL,
    socket: { reconnectStrategy },
  });

  rideSubscriber.on("ready", () => console.info("Ride offer expiry subscriber is ready"));
  rideSubscriber.on("error", (err) =>
    console.error("Ride offer expiry subscriber error:", err?.message)
  );

  await rideSubscriber.connect();
  await verifyKeyspaceEventsEnabled();

  await rideSubscriber.pSubscribe(EXPIRED_EVENT_PATTERN, async (key: string) => {
    // Every expired key in the DB lands here, including chat's. Ignore anything
    // that is not ours before doing any work.
    if (!key || !key.startsWith(TIMER_KEY_PREFIX)) return;

    const rideId = key.slice(TIMER_KEY_PREFIX.length);
    if (!rideId) return;

    console.info(`⏰ [rideOfferExpiry] offer timed out | rideId=${rideId}`);

    try {
      await advanceRideQueue(rideId);
    } catch (err: any) {
      console.error(`❌ [rideOfferExpiry] handler failed for ${rideId}:`, err?.message);
    }
  });

  console.info("📡 Subscribed to ride offer expiry events");
};
