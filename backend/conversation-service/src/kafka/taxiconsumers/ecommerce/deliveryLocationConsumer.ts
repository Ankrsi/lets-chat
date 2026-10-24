import { kafka } from "../../kafkaClient";
import { redisPublisher } from "../../../redis/redisClient";

export const deliveryLocationConsumer = async () => {
  const consumer = kafka.consumer({
    groupId: "delivery-location-consumer",
  });

  await consumer.connect();

  await consumer.subscribe({
    topic: "delivery.location.updated",
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        if (!message.value) return;

        const data = JSON.parse(message.value.toString());

        await redisPublisher.publish(
          `delivery:${data.deliveryId}`,
          JSON.stringify(data)
        );
      } catch (err) {
        console.error("Delivery location consumer error:", err);
      }
    },
  });
};
