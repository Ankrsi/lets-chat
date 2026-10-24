import { kafka } from "../kafkaClient";
import { redisPublisher } from "../../redis/redisClient";

export const driverLocationConsumer = async () => {
  const consumer = kafka.consumer({
    groupId: "driver-location-consumer", // 🔥 different groupId
    retry: {
      retries: 10,
      initialRetryTime: 300,
    },
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: "driver.location.updated", // still consuming same topic
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        if (!message.value) return;
        const data = JSON.parse(message.value.toString());

        const channel = `ride:${data.rideId}`; // 🔥 changed to rideId
        // console.info("Kafka → Redis (ride):", channel, data);

        await redisPublisher.publish(channel, JSON.stringify(data));
      } catch (err) {
        console.error("Error processing Kafka ride message:", err);
      }
    },
  });
};
