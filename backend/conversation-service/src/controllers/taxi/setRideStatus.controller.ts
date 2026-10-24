import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";

/**
 * INTERNAL ENDPOINT (called by riding-service / cron jobs)
 *
 * Server-side twin of the `setRideStatus` socket event. Jobs (e.g. the
 * auto-cancel cron) have no socket connection, so they hit this endpoint
 * instead. It pushes the exact same message to the Kafka `ride.status`
 * topic, which flows: consumer -> Redis `ride-status:{rideId}` ->
 * `rideStatusUpdate` emitted to everyone in the `rideId` room (the passenger).
 */
export const setRideStatus = asyncHandler(async (req, res) => {
  console.info("🚦 [setRideStatus] IN | body=", JSON.stringify(req.body));

  const producer = req.app.get("producer");
  if (!producer) {
    console.error("🚦 [setRideStatus] producer NOT on app — Kafka not initialised");
    throw new ApiError("Kafka producer not initialised", 500);
  }

  const { rideId, status } = req.body as { rideId?: string; status?: string };

  if (!rideId) throw new ApiError("rideId is required", 400);
  if (!status) throw new ApiError("status is required", 400);

  // Whole body is forwarded so any extra fields reach the passenger untouched
  const payload = { ...req.body, rideId: String(rideId), status: String(status) };

  try {
    await producer.send({
      topic: "ride.status",
      messages: [{ key: payload.rideId, value: JSON.stringify(payload) }],
    });
    console.info(
      `🚦 [setRideStatus] -> Kafka ride.status SENT | rideId=${payload.rideId} | status=${payload.status}`
    );
  } catch (err: any) {
    console.error(
      `🚦 [setRideStatus] Kafka send FAILED | rideId=${payload.rideId} | msg=${err?.message}`
    );
    throw new ApiError("Failed to publish ride status to Kafka", 500);
  }

  return new ApiResponse(200, { rideId: payload.rideId, status: payload.status }, "Ride status event published");
});
