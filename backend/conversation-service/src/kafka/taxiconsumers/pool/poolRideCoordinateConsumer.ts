import { kafka } from "../../kafkaClient";
import { redisClient } from "../../../redis/redisClient";
import PoolRideCoordinate from "../../../models/taximodel/PoolRideCoordinate";

export const consumePoolRideCoordinates = async () => {
  const consumer = kafka.consumer({ groupId: "pool-ride-group" });
  await consumer.connect();
  await consumer.subscribe({ topic: "pool.ride.coordinates", fromBeginning: false });

  // console.info("🚀 Pool Ride Coordinate Consumer connected & subscribed!");

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        if (!message.value) return;
        const data = JSON.parse(message.value.toString());
        const { poolRideId, driverId, driverStatus, coordinates, timestamp, passengers } = data;
        if (!poolRideId) return;

        const normalizedId = poolRideId.trim();
        const persistKey = `pool-ride-persist-count:${normalizedId}`;
        const historyKey = `pool-ride-history:${normalizedId}`;

        const count = await redisClient.incr(persistKey);
        if (count === 1) await redisClient.expire(persistKey, 3600);

        // ------------------------------
        // 🚖 DRIVER LOGIC
        // ------------------------------
        let existingDoc = await PoolRideCoordinate.findOne({ poolRideId: normalizedId });

        if (!existingDoc) {
          existingDoc = await PoolRideCoordinate.create({
            poolRideId: normalizedId,
            driverId,
            driverStatus: driverStatus || "idle",
            driverCoordinates:
              driverStatus === "started"
                ? [{ lat: coordinates.lat, lng: coordinates.lng, timestamp: new Date(timestamp) }]
                : [],
            passengers: (passengers || []).map((p: any) => ({
              passengerId: p.passengerId,
              status: p.status,
              coordinates: [],
            })),
          });
          // console.info(`🆕 Created new PoolRideCoordinate for ${normalizedId}`);
        }

        // DRIVER started
        if (driverStatus === "started") {
          const hasCoordinates = existingDoc.driverCoordinates?.length > 0;

          if (!hasCoordinates) {
            await PoolRideCoordinate.updateOne(
              { poolRideId: normalizedId },
              {
                $push: {
                  driverCoordinates: { ...coordinates, timestamp: new Date(timestamp) },
                },
                $set: { driverStatus: "started", updatedAt: new Date() },
              }
            );
            // console.info(`🚀 Driver ${driverId} started → first coordinate saved`);
          } else if (count % 10 === 0) {
            await PoolRideCoordinate.updateOne(
              { poolRideId: normalizedId },
              {
                $push: {
                  driverCoordinates: { ...coordinates, timestamp: new Date(timestamp) },
                },
                $set: { updatedAt: new Date() },
              }
            );
            // console.info(`📍 Driver ${driverId}: every 10th coordinate saved`);
          }
        }

        // DRIVER completed
        if (driverStatus === "completed") {
          if (existingDoc.driverStatus !== "completed") {
            await PoolRideCoordinate.updateOne(
              { poolRideId: normalizedId },
              {
                $push: {
                  driverCoordinates: { ...coordinates, timestamp: new Date(timestamp) },
                },
                $set: { driverStatus: "completed", updatedAt: new Date() },
              }
            );
            // console.info(`✅ Driver ${driverId} completed → final coordinate saved`);
          } else {
            console.info(`🛑 Driver ${driverId} already completed → skipping save`);
          }

          await redisClient.del(persistKey);
          await redisClient.del(historyKey);
        }

        // ------------------------------
        // 👥 PASSENGER LOGIC (fixed)
        // ------------------------------
        if (Array.isArray(passengers)) {
          for (const passenger of passengers) {
            const { passengerId, status } = passenger;
            if (!passengerId) continue;

            const ride = await PoolRideCoordinate.findOne({
              poolRideId: normalizedId,
              "passengers.passengerId": passengerId,
            });
            if (!ride) continue;

            const currentPassenger = ride.passengers.find((p) => p.passengerId === passengerId);
            const coordCount = currentPassenger?.coordinates?.length || 0;
            const alreadyDropped = currentPassenger?.status === "dropped";

            // WAITING
            if (status === "waiting") {
              await PoolRideCoordinate.updateOne(
                { poolRideId: normalizedId, "passengers.passengerId": passengerId },
                { $set: { "passengers.$.status": "waiting", updatedAt: new Date() } }
              );
              // console.info(`⚪ Passenger ${passengerId} waiting — status updated`);
            }

            // ONBOARD
            if (status === "onboard") {
              if (coordCount === 0) {
                await PoolRideCoordinate.updateOne(
                  { poolRideId: normalizedId, "passengers.passengerId": passengerId },
                  {
                    $push: {
                      "passengers.$.coordinates": {
                        ...coordinates,
                        timestamp: new Date(timestamp),
                      },
                    },
                    $set: { "passengers.$.status": "onboard", updatedAt: new Date() },
                  }
                );
                // console.info(`🟢 Passenger ${passengerId} onboard → first coordinate saved`);
              } else if (count % 10 === 0) {
                await PoolRideCoordinate.updateOne(
                  { poolRideId: normalizedId, "passengers.passengerId": passengerId },
                  {
                    $push: {
                      "passengers.$.coordinates": {
                        ...coordinates,
                        timestamp: new Date(timestamp),
                      },
                    },
                    $set: { updatedAt: new Date() },
                  }
                );
                // console.info(`📍 Passenger ${passengerId} onboard → every 10th coordinate saved`);
              }
            }

            // DROPPED
            if (status === "dropped" && !alreadyDropped) {
              await PoolRideCoordinate.updateOne(
                { poolRideId: normalizedId, "passengers.passengerId": passengerId },
                {
                  $push: {
                    "passengers.$.coordinates": {
                      ...coordinates,
                      timestamp: new Date(timestamp),
                    },
                  },
                  $set: { "passengers.$.status": "dropped", updatedAt: new Date() },
                }
              );
              // console.info(`🔴 Passenger ${passengerId} dropped → final coordinate saved`);
            } else if (status === "dropped" && alreadyDropped) {
              console.info(`🛑 Passenger ${passengerId} already dropped → skipping`);
            }
          }
        }

        // console.info(
        //   `🧩 [POOL:${poolRideId}] Driver=${driverId} Status=${driverStatus} Count=${count}`
        // );
      } catch (err) {
        console.error("❌ Error processing pool ride coordinate:", err);
      }
    },
  });
};
