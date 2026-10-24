import { Socket } from "socket.io";
import { Producer } from "kafkajs";
import { redisClient, redisPublisher } from "../../../redis/redisClient";

interface LiveFareUpdate {
  rideId: string;
  coordinates: { lat: number; lng: number };
  timestamp: number;
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  weatherCondition?: string;
  weatherMultiplier?: number;
  surgeMultiplier?: number;
  status?: string;
  [key: string]: unknown;
}

export const liveFareHandler = (socket: Socket, kafkaProducer: Producer) => {
  socket.on("liveFareUpdate", async (data: LiveFareUpdate) => {
    // console.info("Live fare update received from frontend:", data);
    // Updated data example: 
    // { 
    //   rideId: '123', 
    //   coordinates: { lat: 12.34, lng: 56.78 }, 
    //   timestamp: Date.now(), 
    //   baseFare: 60, 
    //   perKmRate: 18, 
    //   perMinuteRate: 3.5, 
    //   weatherCondition: "rain", 
    //   weatherMultiplier: 1.2, 
    //   surgeMultiplier: 1,
    //   status: "ongoing" 
    // }

    const { rideId } = data || {};
    if (!rideId) return;

    try {
      // 1) Fast path: cache last N fare events in Redis (no DB)
      const historyKey = `ride-fare-history:${rideId}`;
      await redisClient.rPush(historyKey, JSON.stringify(data));
      await redisClient.lTrim(historyKey, -100, -1);

      // 2) Realtime fan-out via Redis Pub/Sub (Socket.IO subscribers consume)
      const channel = `ride-fare:${rideId}`;
      await redisPublisher.publish(channel, JSON.stringify(data));

      // 3) Durable processing via Kafka (DB persistence happens in consumer)
      await kafkaProducer.send({
        topic: "live.fare.updated",
        messages: [{ value: JSON.stringify(data) }],
      });

      // console.info("Live fare: Redis cached + published, Kafka produced", {
      //   rideId,
      // });
    } catch (err) {
      console.error("Error handling live fare update:", err);
    }
  });
};
