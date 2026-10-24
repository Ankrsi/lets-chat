import { kafka } from "./kafkaClient";
import { redisPublisher } from "../redis/redisClient";

export const consumeLocationUpdates = async () => {
  const consumer = kafka.consumer({
    groupId: "location-consumer",
    retry: {
      retries: 10,
      initialRetryTime: 300,
    },
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: "driver.location.updated",
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        if (!message.value) return;
        const data = JSON.parse(message.value.toString());
        const channel = `task:${data.taskId}`;

        console.info("Kafka → Redis:", channel, data);
        await redisPublisher.publish(channel, JSON.stringify(data));
      } catch (err) {
        console.error("Error processing Kafka message:", err);
      }
    },
  });
};
