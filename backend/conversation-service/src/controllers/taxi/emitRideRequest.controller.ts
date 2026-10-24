import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import { redisClient } from "../../redis/redisClient";

/**
 * INTERNAL ENDPOINT (called by riding-service)
 *
 * Emits a brand-new ride request ONLY to the nearby drivers passed in.
 *
 * The payload delivered on `ride:new-request` matches the FCM `data`
 * object exactly: { rideId, pickup, destination, fare, app_code,
 * riderFullName, type, screen }. `app_code` is per-driver, so we emit a
 * separate payload per driver (merging in that driver's app_code) rather
 * than one shared broadcast.
 *
 * When `offerTtlSeconds` is set, the payload is ALSO parked under
 * `driver_pending_offer:{phone}` with that TTL. A driver whose app was closed
 * when his turn began gets the FCM push, and on reopening the app he is handed
 * the request again — but only while his turn is still running, because the key
 * dies on its own the moment his window closes.
 */

export const pendingOfferKey = (phone: string) => `driver_pending_offer:${phone}`;

export const emitRideRequest = asyncHandler(async (req, res) => {
  const io = req.app.get("io");
  if (!io) throw new ApiError("Socket server not initialised", 500);

  const { ride, drivers, offerTtlSeconds } = req.body as {
    ride: Record<string, unknown>;
    drivers: { phone: string | number; app_code?: string }[];
    offerTtlSeconds?: number;
  };

  if (!ride || typeof ride !== "object") {
    throw new ApiError("ride payload is required", 400);
  }
  if (!Array.isArray(drivers) || drivers.length === 0) {
    throw new ApiError("drivers must be a non-empty array", 400);
  }

  // Dedupe by phone (keep the first app_code seen for that phone)
  const byPhone = new Map<string, string>();
  for (const d of drivers) {
    const phone = String(d?.phone ?? "");
    if (!phone) continue;
    if (!byPhone.has(phone)) byPhone.set(phone, d?.app_code ?? "");
  }

  const deliveredTo: string[] = [];
  const offlinePhones: string[] = [];
  let socketsNotified = 0;

  const ttl = Number(offerTtlSeconds);
  const parkOffer = Number.isFinite(ttl) && ttl > 0;

  await Promise.all(
    [...byPhone.entries()].map(async ([phone, app_code]) => {
      // Exact FCM `data` shape (app_code merged in per-driver)
      const payload = { ...ride, app_code };

      // Park it for the length of this driver's turn, whether or not he is
      // reachable right now — that is the whole point: if his app was closed we
      // still want it waiting for him when he opens it. It expires by itself
      // when his turn ends, so a late reconnect gets nothing.
      if (parkOffer) {
        await redisClient.set(pendingOfferKey(phone), JSON.stringify(payload), { EX: ttl });
      }

      const raw = await redisClient.hGet("userSocketMap", phone);
      const socketIds: string[] = raw ? JSON.parse(raw) : [];

      if (!socketIds.length) {
        offlinePhones.push(phone);
        return;
      }

      io.to(socketIds).emit("ride:new-request", payload);

      socketsNotified += socketIds.length;
      deliveredTo.push(phone);
    })
  );

  console.info(
    `🚕 ride:new-request emitted -> ${deliveredTo.length} online driver(s), ${socketsNotified} socket(s)`
  );

  return new ApiResponse(
    200,
    {
      rideId: (ride as any)?.rideId ?? null,
      requestedDrivers: byPhone.size,
      onlineDrivers: deliveredTo.length,
      offlineDrivers: offlinePhones.length,
      socketsNotified,
      offlinePhones,
    },
    "Ride request emitted to nearby drivers"
  );
});

/**
 * INTERNAL ENDPOINT (called by riding-service)
 *
 * Tells a driver his ride request is no longer his — he declined it, his window
 * ran out, or someone else took the ride. Without this his request card would
 * sit on screen while the ride has already moved to the next driver.
 *
 * Emits `ride:request-closed` with a reason.
 */
export const emitRideRequestClosed = asyncHandler(async (req, res) => {
  const io = req.app.get("io");
  if (!io) throw new ApiError("Socket server not initialised", 500);

  const { rideId, drivers, reason } = req.body as {
    rideId?: string;
    drivers?: { phone: string | number }[];
    reason?: string;
  };

  if (!rideId) throw new ApiError("rideId is required", 400);
  if (!Array.isArray(drivers) || drivers.length === 0) {
    throw new ApiError("drivers must be a non-empty array", 400);
  }

  const phones = [
    ...new Set(drivers.map((d) => String(d?.phone ?? "")).filter(Boolean)),
  ];

  let notified = 0;

  await Promise.all(
    phones.map(async (phone) => {
      // Drop the parked offer first — otherwise a driver who declined at second 3
      // would be handed the same request again if he reopened the app before his
      // original window ran out.
      await redisClient.del(pendingOfferKey(phone));

      const raw = await redisClient.hGet("userSocketMap", phone);
      const socketIds: string[] = raw ? JSON.parse(raw) : [];
      if (!socketIds.length) return;

      io.to(socketIds).emit("ride:request-closed", {
        rideId,
        reason: reason || "passed_on",
      });
      notified += 1;
    })
  );

  console.info(
    `🚪 ride:request-closed emitted | rideId=${rideId} | reason=${reason || "passed_on"} | drivers=${notified}/${phones.length}`
  );

  return new ApiResponse(
    200,
    { rideId, requested: phones.length, notified },
    "Ride request closed for drivers"
  );
});
