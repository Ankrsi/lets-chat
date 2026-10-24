import { kafka } from "../kafkaClient";
import { redisPublisher, redisClient } from "../../redis/redisClient";
import { RideCoordinate } from "../../models/taximodel/RideCoordinate";
import { calculateDistance } from "../../utils/distanceCalculator";

// Helper to validate coordinates
function hasValidCoordinates(coord: any): coord is { lat: number; lng: number } {
  return coord && typeof coord.lat === "number" && typeof coord.lng === "number";
}

export const liveFareConsumer = async () => {
  const consumer = kafka.consumer({
    groupId: "live-fare-consumer",
    retry: { retries: 10, initialRetryTime: 300 },
  });

  await consumer.connect();
  await consumer.subscribe({ topic: "live.fare.updated", fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        if (!message.value) return;
        const data = JSON.parse(message.value.toString());

        const {
          rideId,
          coordinates,
          timestamp,
          baseFare,
          perKmRate,
          perMinuteRate,
          weatherCondition,
          weatherMultiplier,
          surgeMultiplier,
          status,
        } = data;

        if (!rideId || !hasValidCoordinates(coordinates)) return;

        // ✅ Always store rideId as string to maintain consistency
        const normalizedRideId = rideId.toString();

        const rideStatus = status ?? "ongoing";
        const now = new Date(timestamp);
        const currentTs = now.getTime();

        // Load existing state from Redis
        const stateKey = `ride-fare-state:${normalizedRideId}`;
        let stateRaw = await redisClient.get(stateKey);
        let state;

        try {
          state = stateRaw ? JSON.parse(stateRaw) : null;
        } catch {
          state = null;
        }

        if (
          !state ||
          typeof state.totalDistance !== "number" ||
          typeof state.totalTime !== "number" ||
          isNaN(state.totalDistance) ||
          isNaN(state.totalTime)
        ) {
          // state = { totalDistance: 0, totalTime: 0, lastCoord: null, lastTimestamp: null };
          state = {
            totalDistance: 0,
            totalTime: 0,
            chargeableTime: 0,
            lastCoord: null,
            lastTimestamp: null,
          };
        }

        // totalTime = full ride time (tracked from the very first coordinate)
        // chargeableTime = time accumulated only after crossing the included distance
        let totalDistance = state.totalDistance;
        let totalTime = state.totalTime;
        let chargeableTime =
          typeof state.chargeableTime === "number" && !isNaN(state.chargeableTime)
            ? state.chargeableTime
            : 0;

        // Incremental distance/time calculation
        // if (state.lastCoord && hasValidCoordinates(state.lastCoord)) {
        //   const deltaDist = calculateDistance(state.lastCoord, coordinates);
        //   const deltaTime = (currentTs - (state.lastTimestamp || currentTs)) / (1000 * 60);

        //   if (deltaDist > 0.03) totalDistance += deltaDist;
        //   if (deltaTime > 0 && rideStatus.toLowerCase() !== "paused") totalTime += deltaTime;
        // }

        const includedDistance = 3;

        if (state.lastCoord && hasValidCoordinates(state.lastCoord)) {
          const deltaDist = calculateDistance(state.lastCoord, coordinates);
          const deltaTime =
            (currentTs - (state.lastTimestamp || currentTs)) / (1000 * 60);

          if (deltaDist > 0.03) {
            totalDistance += deltaDist;
          }

          if (deltaTime > 0 && rideStatus.toLowerCase() !== "paused") {
            // Always track the elapsed ride time (so it is visible before 3 km too)
            totalTime += deltaTime;

            // Only the time spent after crossing 3 km is billable
            if (totalDistance >= includedDistance) {
              chargeableTime += deltaTime;
            }
          }
        }

        totalDistance = Math.max(Number(totalDistance) || 0, state.totalDistance);
        totalTime = Math.max(Number(totalTime) || 0, state.totalTime);
        chargeableTime = Math.max(Number(chargeableTime) || 0, 0);

        state = {
          totalDistance,
          totalTime,
          chargeableTime,
          lastCoord: coordinates,
          lastTimestamp: currentTs,
        };
        await redisClient.set(stateKey, JSON.stringify(state));

        // Keep short history
        const historyKey = `ride-fare-history:${normalizedRideId}`;
        await redisClient.rPush(
          historyKey,
          JSON.stringify({ coordinates, timestamp, status: rideStatus })
        );
        await redisClient.lTrim(historyKey, -100, -1);

        // Fare calculation
        const base = Number(baseFare) || 0;
        const perKm = Number(perKmRate) || 0;
        const perMin = Number(perMinuteRate) || 0;
        const weatherMul = Number(weatherMultiplier) || 1;
        const surgeMul = Number(surgeMultiplier) || 1;

        // const rawFare = base + totalDistance * perKm + totalTime * perMin;
        // const finalFare = Math.round(rawFare * weatherMul * surgeMul);
        // let finalFare: number;

        // if (totalDistance <= 3) {
        //   // For first 3 km → base fare only
        //   finalFare = Math.round(base);
        // } else {
        //   // After 3 km → normal calculation
        //   const rawFare =
        //     base +
        //     totalDistance * perKm +
        //     totalTime * perMin;

        //   finalFare = Math.round(rawFare * weatherMul * surgeMul);
        // }

        // const includedDistance = 3;

        let finalFare: number;

        if (totalDistance <= includedDistance) {
          // Only base fare till 3 km
          finalFare = Math.round(base);
        } else {
          // Above 3 km the WHOLE distance and ride time are charged on top of the
          // base fare (first 3 km not deducted) — same rule as the estimate in
          // taxi-riding-service getFareNew.service.ts
          const rawFare =
            base +
            totalDistance * perKm +
            totalTime * perMin;

          finalFare = Math.round(rawFare * weatherMul * surgeMul);
        }

        const newCoord = {
          lat: coordinates.lat,
          lng: coordinates.lng,
          timestamp: now,
          weatherCondition,
          status: rideStatus,
          totalDistance,
          totalTime,
          chargeableTime,
          currentFare: finalFare,
        };

        const channel = `ride-fare:${normalizedRideId}`;
        await redisPublisher.publish(channel, JSON.stringify(newCoord));

        // ✅ ADDED: store last live fare (overwrite)
        await redisClient.set(
          `ride:last-fare:${normalizedRideId}`,
          JSON.stringify(newCoord),
          { EX: 60 * 60 } // 1 hour expiry
        );

        // ✅ MongoDB persistence using normalizedRideId
        const persistCounterKey = `ride-fare-persist-count:${normalizedRideId}`;
        let count = await redisClient.incr(persistCounterKey);

        const rideExists = await RideCoordinate.findOne({ rideId: normalizedRideId });
        if (!rideExists) {
          await RideCoordinate.create({ rideId: normalizedRideId, coordinates: [newCoord] });
          // console.info(`✅ First coordinate stored for rideId: ${normalizedRideId}`);
          count = 1;
        }

        const isTerminal = ["ended", "completed", "cancelled", "finished"].includes(
          rideStatus.toLowerCase()
        );

        if (count % 10 === 0 || isTerminal) {
          await RideCoordinate.updateOne(
            { rideId: normalizedRideId },
            { $push: { coordinates: newCoord } },
            { upsert: true }
          );

          if (isTerminal) {
            // console.info(`✅ Ride ended → last coordinate stored for rideId: ${normalizedRideId}`);
            await redisClient.del(historyKey);
            await redisClient.del(persistCounterKey);
            await redisClient.del(stateKey);
            await redisClient.del(channel);
            // console.info(`🗑️ Redis cleared for rideId: ${normalizedRideId}`);
          } else {
            console.info(`ℹ️ Periodic DB write (#${count}) for rideId: ${normalizedRideId}`);
          }
        }
      } catch (err) {
        console.error("Error processing live fare message:", err);
      }
    },
  });
};
