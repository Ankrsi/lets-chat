import { kafka } from "../../kafkaClient";
import { redisPublisher } from "../../../redis/redisClient";

export const orderLocationConsumer = async () => {
  const consumer = kafka.consumer({
    groupId: "order-location-consumer",
  });

  await consumer.connect();

  await consumer.subscribe({
    topic: "order.location.updated",
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        if (!message.value) return;

        const data = JSON.parse(message.value.toString());

        await redisPublisher.publish(
          `order:${data.orderId}`,
          JSON.stringify(data)
        );
      } catch (err) {
        console.error("Order location consumer error:", err);
      }
    },
  });
};