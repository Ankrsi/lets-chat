import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import { redisClient } from "../../redis/redisClient";
import { pendingOfferKey } from "./emitRideRequest.controller";

/**
 * INTERNAL ENDPOINTS (called by riding-service)
 *
 * State for sequential ride dispatch — the ride request is offered to ONE
 * driver at a time instead of being broadcast to everyone nearby.
 *
 * Two keys per ride:
 *   ride_queue:{rideId}        the scored + sorted driver list and whose turn it is
 *   ride_offer_timer:{rideId}  value is meaningless — the key exists only so that
 *                              its EXPIRY fires `__keyevent@0__:expired`, which is
 *                              what advances the queue to the next driver
 *                              (see redis/rideOfferExpiry.subscriber.ts)
 *
 * Deleting the timer key is how the chain is stopped: no key -> no expiry event
 * -> nothing advances. Used when a driver accepts or the ride is cancelled.
 */

export const queueKey = (rideId: string) => `ride_queue:${rideId}`;
export const timerKey = (rideId: string) => `ride_offer_timer:${rideId}`;

const DEFAULT_QUEUE_TTL_SECONDS = 15 * 60;
const MAX_QUEUE_TTL_SECONDS = 60 * 60;
const MAX_TIMER_SECONDS = 5 * 60;

/**
 * POST /api/v1/taxi/ride-queue
 * Body: { rideId, queue, ttlSeconds? }
 *
 * Called once when the ride is created, and again on every advance so the
 * updated `index` is persisted.
 */
export const storeRideQueue = asyncHandler(async (req, res) => {
  const { rideId, queue, ttlSeconds } = req.body as {
    rideId?: string;
    queue?: unknown;
    ttlSeconds?: number;
  };

  if (!rideId) throw new ApiError("rideId is required", 400);
  if (!queue || typeof queue !== "object") {
    throw new ApiError("queue object is required", 400);
  }

  const ttl = Math.min(
    Number(ttlSeconds) > 0 ? Number(ttlSeconds) : DEFAULT_QUEUE_TTL_SECONDS,
    MAX_QUEUE_TTL_SECONDS
  );

  await redisClient.set(queueKey(rideId), JSON.stringify(queue), { EX: ttl });

  console.info(`🗂️ [rideQueue] stored | rideId=${rideId} | ttl=${ttl}s`);

  return new ApiResponse(200, { rideId, ttlSeconds: ttl }, "Ride queue stored");
});

/**
 * POST /api/v1/taxi/ride-queue/:rideId/arm-timer
 * Body: { seconds }
 *
 * Starts (or restarts) the countdown for the driver who was just offered the
 * ride. When it expires the subscriber advances the queue.
 */
export const armRideOfferTimer = asyncHandler(async (req, res) => {
  const { rideId } = req.params;
  const { seconds } = req.body as { seconds?: number };

  if (!rideId) throw new ApiError("rideId is required", 400);

  const ttl = Number(seconds);
  if (!ttl || ttl <= 0) throw new ApiError("seconds must be a positive number", 400);
  if (ttl > MAX_TIMER_SECONDS) {
    throw new ApiError(`seconds must not exceed ${MAX_TIMER_SECONDS}`, 400);
  }

  await redisClient.set(timerKey(rideId), "1", { EX: ttl });

  console.info(`⏱️ [rideQueue] offer timer armed | rideId=${rideId} | ${ttl}s`);

  return new ApiResponse(200, { rideId, seconds: ttl }, "Ride offer timer armed");
});

/**
 * GET /api/v1/taxi/ride-queue/:rideId
 */
export const getRideQueue = asyncHandler(async (req, res) => {
  const { rideId } = req.params;
  if (!rideId) throw new ApiError("rideId is required", 400);

  const raw = await redisClient.get(queueKey(rideId));
  if (!raw) throw new ApiError("Ride queue not found", 404);

  return new ApiResponse(200, JSON.parse(raw), "Ride queue fetched");
});

/**
 * DELETE /api/v1/taxi/ride-queue/:rideId
 *
 * Removes BOTH keys. Dropping the timer key is what stops any further
 * dispatching for this ride.
 *
 * Also clears any parked offer belonging to a driver in this queue, so a driver
 * who reopens his app cannot be handed a request that has already been accepted
 * or cancelled. Covers accept, passenger cancel, auto-cancel and exhaustion in
 * one place.
 */
export const deleteRideQueue = asyncHandler(async (req, res) => {
  const { rideId } = req.params;
  if (!rideId) throw new ApiError("rideId is required", 400);

  let pendingCleared = 0;

  try {
    const raw = await redisClient.get(queueKey(rideId));
    if (raw) {
      const phones: string[] = [
        ...new Set(
          (JSON.parse(raw)?.drivers ?? [])
            .map((d: any) => String(d?.phone ?? ""))
            .filter(Boolean) as string[]
        ),
      ];

      if (phones.length) {
        pendingCleared = await redisClient.del(phones.map(pendingOfferKey));
      }
    }
  } catch (err: any) {
    // Never block the delete on cleanup — a stale parked offer expires on its own.
    console.error(`⚠️ [rideQueue] could not clear parked offers for ${rideId}:`, err?.message);
  }

  const removed = await redisClient.del([queueKey(rideId), timerKey(rideId)]);

  console.info(
    `🧹 [rideQueue] deleted | rideId=${rideId} | keysRemoved=${removed} | parkedOffersCleared=${pendingCleared}`
  );

  return new ApiResponse(
    200,
    { rideId, keysRemoved: removed, pendingCleared },
    "Ride queue deleted"
  );
});
