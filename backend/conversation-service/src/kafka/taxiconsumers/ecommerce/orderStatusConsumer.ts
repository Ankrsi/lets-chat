import { kafka } from "../../kafkaClient";
import { redisPublisher } from "../../../redis/redisClient";

export const orderStatusConsumer = async () => {
    const consumer = kafka.consumer({
        groupId: "order-status-consumer",
        retry: {
            retries: 10,
            initialRetryTime: 300,
        },
    });

    await consumer.connect();

    await consumer.subscribe({
        topic: "order.status",
        fromBeginning: false,
    });

    await consumer.run({
        eachMessage: async ({ message }) => {
            try {
                if (!message.value) return;

                const evtStr = message.value.toString();
                const evt = JSON.parse(evtStr);

                const channel = `order-status:${evt.orderId}`;

                const lastKey = `order:last-status:${evt.orderId}`;

                // Publish to Redis
                await redisPublisher.publish(channel, evtStr);

                // Save latest status
                await redisPublisher.set(lastKey, evtStr, {
                    EX: 60 * 60,
                });

                console.info(
                    "Kafka → Redis (Order Status):",
                    evt.orderId,
                    evt.status
                );
            } catch (err) {
                console.error(
                    "Error processing Kafka order-status message:",
                    err
                );
            }
        },
    });
};