import { kafka } from "../../kafkaClient";
import { redisPublisher } from "../../../redis/redisClient";

export const poolAcceptConsumer = async () => {
  const consumer = kafka.consumer({
    groupId: "pool-accept-consumer",
    retry: { retries: 10, initialRetryTime: 300 },
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: "pool.ride.accepted",
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        if (!message.value) return;

        const evtStr = message.value.toString();
        const evt = JSON.parse(evtStr);

        const requestId = evt.requestId;
        if (!requestId) return;

        const channel = `pool-accept:${requestId}`;
        const lastKey = `pool:last-accept:${requestId}`;

        // 🔴 Publish to Redis (fan-out)
        await redisPublisher.publish(channel, evtStr);

        // 🔴 Save last accept (reconnect support)
        await redisPublisher.set(lastKey, evtStr, {
          EX: 60 * 60, // 1 hour
        });

        // console.info("Kafka → Redis (Pool Accept):", requestId, evt);
      } catch (err) {
        console.error("Error processing pool accept message:", err);
      }
    },
  });
};
