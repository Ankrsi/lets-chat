import { kafka } from "../kafkaClient";
import { redisPublisher } from "../../redis/redisClient";

export const rideStatusConsumer = async () => {
  const consumer = kafka.consumer({
    groupId: "ride-status-consumer",
    retry: {
      retries: 10,
      initialRetryTime: 300,
    },
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: "ride.status",
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        if (!message.value) return;

        const evtStr = message.value.toString();
        const evt = JSON.parse(evtStr);

        const channel = `ride-status:${evt.rideId}`;
        // console.info("Kafka → Redis (ride-status):", channel, evt);
        const lastKey = `ride:last-status:${evt.rideId}`; // ✅ ADDED

        // ✅ Only this publishes to Redis
        await redisPublisher.publish(channel, evtStr);

        // ✅ ADDED: Save last status with 1 hour expiry
        await redisPublisher.set(lastKey, evtStr, {
          EX: 60 * 60, // 1 hour
        });

        // console.info("Kafka → Redis (ride-status):", evt);

      } catch (err) {
        console.error("Error processing Kafka ride-status message:", err);
      }
    },
  });
};
