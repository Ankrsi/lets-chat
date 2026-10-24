import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";

/**
 * INTERNAL ENDPOINT (called by riding-service / cron jobs)
 *
 * Server-side twin of the `driverAcceptedPoolRide` socket event. Jobs (e.g. the
 * pool auto-cancel cron) have no socket connection, so they hit this endpoint
 * instead. It pushes the same message to the Kafka `pool.ride.accepted` topic,
 * which flows: poolAcceptConsumer -> Redis `pool-accept:{requestId}` ->
 * `poolRideUpdate` emitted to everyone in the `requestId` room (the passenger).
 */
export const setPoolRideStatus = asyncHandler(async (req, res) => {
  console.info("🏊 [setPoolRideStatus] IN | body=", JSON.stringify(req.body));

  const producer = req.app.get("producer");
  if (!producer) {
    console.error("🏊 [setPoolRideStatus] producer NOT on app — Kafka not initialised");
    throw new ApiError("Kafka producer not initialised", 500);
  }

  const { requestId, status } = req.body as { requestId?: string; status?: string };

  if (!requestId) throw new ApiError("requestId is required", 400);
  if (!status) throw new ApiError("status is required", 400);

  // Same shape the `driverAcceptedPoolRide` handler produces (whole body
  // forwarded so extra fields reach the passenger untouched).
  const payload = {
    ...req.body,
    requestId: String(requestId),
    status: String(status),
    ts: Date.now(),
  };

  try {
    await producer.send({
      topic: "pool.ride.accepted",
      messages: [{ key: payload.requestId, value: JSON.stringify(payload) }],
    });
    console.info(
      `🏊 [setPoolRideStatus] -> Kafka pool.ride.accepted SENT | requestId=${payload.requestId} | status=${payload.status}`
    );
  } catch (err: any) {
    console.error(
      `🏊 [setPoolRideStatus] Kafka send FAILED | requestId=${payload.requestId} | msg=${err?.message}`
    );
    throw new ApiError("Failed to publish pool ride status to Kafka", 500);
  }

  return new ApiResponse(
    200,
    { requestId: payload.requestId, status: payload.status },
    "Pool ride status event published"
  );
});
