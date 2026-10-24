import { Socket } from "socket.io";
import axios from "axios";
import { redisClient } from "../../../redis/redisClient";
import { pendingOfferKey } from "../../../controllers/taxi/emitRideRequest.controller";

/**
 * DRIVER-SIDE RIDE REQUEST LISTENER
 *
 * New ride requests are pushed to a driver's socket via the internal
 * `POST /api/v1/taxi/emit-ride-request` endpoint, which emits the
 * `ride:new-request` event straight to the driver's socketIds.
 *
 * This handler gives the driver app a lightweight channel to:
 *   - announce it is ready to receive requests (`ride:subscribe-requests`)
 *   - acknowledge a received request (`ride:request-ack`)
 *   - DECLINE a request (`ride:decline`)  <- moves the ride on immediately
 *   - stop receiving (`ride:unsubscribe-requests`)
 *
 * The driver simply needs to `socket.on("ride:new-request", cb)` on the
 * client to continuously listen for incoming ride requests.
 *
 * Accepting is NOT a socket event: the driver app calls the `confirm-ride` REST
 * API, which claims the ride atomically and stops the dispatch chain there. One
 * authoritative path, no race between a socket message and the database.
 */

// Dedupes a double-tapped decline from the SAME driver. Deliberately keyed by
// driver too, so one driver's decline never blocks the next driver's.
const DECLINE_LOCK_SECONDS = 30;

/** Returns what riding-service actually did, so it can be echoed back to the app. */
const advanceAfterDecline = async (
  rideId: string,
  phone: string
): Promise<{ outcome: string; detail?: unknown }> => {
  const baseUrl = process.env.RIDING_SERVICE_BASE_URL;

  if (!baseUrl) {
    console.error(
      `❌ [ride:decline] RIDING_SERVICE_BASE_URL not configured — ride ${rideId} will wait for its offer to time out instead`
    );
    return { outcome: "not_configured" };
  }

  const lock = await redisClient.set(`ride_decline_lock:${rideId}:${phone}`, "1", {
    NX: true,
    EX: DECLINE_LOCK_SECONDS,
  });

  if (lock !== "OK") {
    console.info(`🔒 [ride:decline] duplicate decline ignored | rideId=${rideId} | phone=${phone}`);
    return { outcome: "duplicate" };
  }

  try {
    const { data } = await axios.post(
      `${baseUrl.replace(/\/$/, "")}/api/v1/riding/internal/dispatch-next`,
      { rideId, declinedByPhone: phone },
      {
        headers: { "x-internal-api-key": process.env.INTERNAL_API_KEY || "" },
        timeout: 10000,
      }
    );

    const result = data?.data ?? data;
    console.info(`⏭️ [ride:decline] ride ${rideId} moved on after decline:`, result);

    return { outcome: result?.outcome ?? "unknown", detail: result };
  } catch (err: any) {
    const message = err?.response?.data?.message || err?.message;
    console.error(`❌ [ride:decline] failed to advance ride ${rideId}: ${message}`);
    return { outcome: "error", detail: message };
  }
};

/**
 * Hands a driver the request he is currently holding, if any.
 *
 * A driver whose app was closed when his turn began still receives the FCM push,
 * but the socket event went nowhere. When he opens the app we replay it — but
 * only if his turn is still running. The parked offer carries the TTL of his
 * window, so once it lapses there is nothing to replay and he correctly gets
 * nothing.
 *
 * `offerTimeoutSeconds` is rewritten to the time he has LEFT, not the full
 * window, so his countdown is honest about how long he really has.
 */
const replayPendingOffer = async (socket: Socket, phone: string) => {
  try {
    const key = pendingOfferKey(phone);

    const [raw, remaining] = await Promise.all([
      redisClient.get(key),
      redisClient.ttl(key),
    ]);

    // No offer parked, or it lapsed between the two reads
    if (!raw || remaining <= 0) return;

    const payload = {
      ...JSON.parse(raw),
      offerTimeoutSeconds: String(remaining),
      replay: "true",
    };

    socket.emit("ride:new-request", payload);

    console.info(
      `🔁 Replayed pending ride request to reconnected driver | phone=${phone} | rideId=${payload?.rideId ?? payload?.packageId ?? "?"} | ${remaining}s left`
    );
  } catch (err: any) {
    console.error(`❌ [replayPendingOffer] failed for ${phone}:`, err?.message);
  }
};

export const rideRequestHandler = (socket: Socket) => {
  // Driver announces it is online & ready to receive ride requests.
  socket.on("ride:subscribe-requests", async () => {
    const phone = socket.user?.phone;
    // Room is optional (we emit by socketId), but lets us broadcast to
    // "all listening drivers" later if ever needed.
    socket.join("ride-request-listeners");
    console.info(
      `🚕 Driver subscribed to ride requests | phone=${phone ?? "unknown"} | socket=${socket.id}`
    );
    socket.emit("ride:subscribed-requests", {
      message: "Listening for new ride requests",
    });

    // He may have missed his turn's socket event while the app was closed
    if (phone) await replayPendingOffer(socket, String(phone));
  });

  // Driver acknowledges it actually received a ride request.
  // Telemetry ONLY — this does not accept, decline or hold the request.
  socket.on("ride:request-ack", (payload: { rideId?: string } = {}) => {
    console.info(
      `🚕 Ride request ACK | rideId=${payload?.rideId ?? "?"} | phone=${socket.user?.phone ?? "unknown"} | socket=${socket.id}`
    );
  });

  /**
   * Driver declines the request — pass it straight to the next driver instead of
   * burning the rest of his offer window.
   *
   * Accepts `packageId` too: package deliveries run through the same dispatch
   * chain, and the driver app carries that id for them.
   */
  socket.on(
    "ride:decline",
    async (payload: { rideId?: string; packageId?: string } = {}) => {
      const rideId = payload?.rideId || payload?.packageId;
      const phone = socket.user?.phone;

      console.info(
        `🙅 Ride request DECLINED | rideId=${rideId ?? "?"} | phone=${phone ?? "unknown"} | socket=${socket.id}`
      );

      if (!rideId || !phone) {
        socket.emit("ride:decline-ack", {
          rideId: rideId ?? null,
          accepted: false,
          message: "rideId (or packageId) is required and the socket must be authenticated",
        });
        return;
      }

      try {
        const result = await advanceAfterDecline(String(rideId), String(phone));

        // Echo what actually happened. `outcome` tells you whether the request
        // moved to another driver ("offered"), ran out of drivers ("exhausted"),
        // was already taken ("ride_closed"), or was rejected as not coming from
        // the current holder ("stale_decline").
        socket.emit("ride:decline-ack", {
          rideId,
          accepted: true,
          outcome: result.outcome,
          detail: result.detail ?? null,
        });
      } catch (err: any) {
        console.error(`❌ [ride:decline] handler failed for ${rideId}:`, err?.message);
        socket.emit("ride:decline-ack", {
          rideId,
          accepted: true,
          outcome: "error",
          detail: err?.message ?? null,
        });
      }
    }
  );

  // Driver stops listening (e.g. went offline / busy).
  socket.on("ride:unsubscribe-requests", () => {
    socket.leave("ride-request-listeners");
    socket.emit("ride:unsubscribed-requests", {
      message: "Stopped listening for new ride requests",
    });
  });
};
