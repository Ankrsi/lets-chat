import { Socket } from "socket.io";
import { Producer } from "kafkajs";
import { redisClient, redisPublisher } from "../../../../redis/redisClient";

interface PoolRideCoordinatePayload {
  poolRideId: string;
  driverId: string;
  driverStatus: "idle" | "started" | "completed"; // 👈 NEW: driver tracking status
  coordinates: { lat: number; lng: number };
  timestamp: number;
  passengers: {
    passengerId: string;
    status: "waiting" | "onboard" | "dropped";
  }[];
}

export const poolRideCoordinateHandler = (socket: Socket, kafkaProducer: Producer) => {
  socket.on("poolRideCoordinateUpdate", async (data: PoolRideCoordinatePayload) => {
    // console.info("📡 Pool ride coordinate update received:", data);

    const { poolRideId } = data || {};
    if (!poolRideId) return;

    try {
      // 1️⃣ Cache short coordinate history in Redis
      const historyKey = `pool-ride-history:${poolRideId}`;
      await redisClient.rPush(historyKey, JSON.stringify(data));
      await redisClient.lTrim(historyKey, -200, -1);

      // 2️⃣ Publish live update for all subscribers (UI / tracker)
      const channel = `pool-ride:${poolRideId}`;
      await redisPublisher.publish(channel, JSON.stringify(data));

      // 3️⃣ Produce message to Kafka for async persistence
      await kafkaProducer.send({
        topic: "pool.ride.coordinates",
        messages: [{ value: JSON.stringify(data) }],
      });

      // console.info("✅ Pool ride coordinates cached + published + produced", { poolRideId });
    } catch (err) {
      console.error("❌ Error handling pool ride coordinate update:", err);
    }
  });
};
