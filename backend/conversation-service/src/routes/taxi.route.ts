import { Router } from "express";
import { redisClient } from "../redis/redisClient";
import { randomUUID } from "crypto";
import { getNearbyDrivers } from "../controllers/taxi/getNearbyDrivers.controller";
import { getRidePolyline } from "../controllers/taxi/getRidePolyline.controller";
import { getRideCoordinates } from "../controllers/taxi/getRideCoordinates.controller";
import {
  emitRideRequest,
  emitRideRequestClosed,
} from "../controllers/taxi/emitRideRequest.controller";
import { setRideStatus } from "../controllers/taxi/setRideStatus.controller";
import { setPoolRideStatus } from "../controllers/taxi/setPoolRideStatus.controller";
import {
  storeRideQueue,
  armRideOfferTimer,
  getRideQueue,
  deleteRideQueue,
} from "../controllers/taxi/rideQueue.controller";
import { verifyInternalRequest } from "../middlewares/internal-auth.middleware";


const router = Router();

// Nearby drivers endpoint
router.get("/nearby", getNearbyDrivers);

router.get("/ride/polyline/:rideId", getRidePolyline);

router.get('/ride-coordinates/:ride_id',verifyInternalRequest, getRideCoordinates);

// Emit a new ride request to nearby drivers (called by riding-service)
router.post("/emit-ride-request", verifyInternalRequest, emitRideRequest);

// Tell a driver his ride request is no longer his (declined / timed out / taken)
router.post("/emit-ride-request-closed", verifyInternalRequest, emitRideRequestClosed);

// Publish a ride status update to the passenger (called by riding-service / cron)
router.post("/set-ride-status", verifyInternalRequest, setRideStatus);

// Publish a pool ride status update to the passenger (called by riding-service / cron)
router.post("/set-pool-ride-status", verifyInternalRequest, setPoolRideStatus);

// Sequential ride dispatch queue (called by riding-service)
router.post("/ride-queue", verifyInternalRequest, storeRideQueue);
router.post("/ride-queue/:rideId/arm-timer", verifyInternalRequest, armRideOfferTimer);
router.get("/ride-queue/:rideId", verifyInternalRequest, getRideQueue);
router.delete("/ride-queue/:rideId", verifyInternalRequest, deleteRideQueue);

// Resolve share token -> rideId
router.get("/share/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const key = `share:${token}`;
    const raw = await redisClient.get(key);
    if (!raw) return res.status(404).json({ success: false, message: "Invalid or expired token" });
    const payload = JSON.parse(raw);
    return res.json({ success: true, data: { rideId: payload.rideId,jwtToken: payload.jwtToken, expiresIn: payload.expiresIn, createdAt: payload.createdAt } });
  } catch (e) {
    console.error("/share/:token error", e);
    return res.status(500).json({ success: false, message: "Failed to resolve token" });
  }
});

// Create share token (called by riding-service)
router.post("/share", async (req, res) => {
  try {
    const { rideId, ttlSeconds } = req.body as { rideId: string; ttlSeconds?: number };
    const jwtToken = req.headers.authorization || "";
    if (!rideId) return res.status(400).json({ success: false, message: "rideId is required" });
    const token = randomUUID().replace(/-/g, "");
    const payload = {
      rideId: String(rideId),
      jwtToken, // 👈 STORE JWT
      createdAt: Date.now(),
      expiresIn: ttlSeconds && ttlSeconds > 60 ? ttlSeconds : 60 * 60,
      version: 1,
    };
    await redisClient.set(`share:${token}`, JSON.stringify(payload), { EX: payload.expiresIn });
    const publicBase = process.env.SUPERAPP_TAXI_BOOKING_TRACKER || "https://superapp-tracker.testsdlc.in/";
    // const publicBase = process.env.SUPERAPP_TAXI_BOOKING_TRACKERR || "http://127.0.0.1:5500/index.html";
    const shareUrl = `${publicBase}?token=${token}`;

    return res.status(201).json({ success: true, data: { token, shareUrl, rideId: payload.rideId, expiresIn: payload.expiresIn } });
  } catch (e) {
    console.error("/share error", e);
    return res.status(500).json({ success: false, message: "Failed to create share link" });
  }
});

export default router;
