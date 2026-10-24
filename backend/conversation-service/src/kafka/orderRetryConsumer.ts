import { kafka } from "./kafkaClient";
import { publishToKafka } from "./kafkaProducer";

const MAIN_TOPIC = "payment-settlement-order";
const RETRY_TOPIC = "payment-settlement-order-retry";
const DLQ_TOPIC = "payment-settlement-order-dlq";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000; // base delay, grows with each attempt

export const consumeOrderRetries = async () => {
  const consumer = kafka.consumer({
    groupId: "order-settlement-retry-group",
    retry: { retries: 0 }, // disable Kafka auto-retry
  });

  await consumer.connect();
  await consumer.subscribe({ topic: RETRY_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const payload = JSON.parse(message.value.toString());
      const { data, retryCount = 0 } = payload;

      const orderId = data?.meta_data?.service_id;

      // Without a ceiling a settlement that can never succeed is replayed
      // between the two topics forever, so park it for manual handling.
      if (retryCount >= MAX_RETRIES) {
        console.error(
          `[ORDER RETRY] order=${orderId} gave up after ${retryCount} attempts, moving to DLQ`,
        );

        await publishToKafka(DLQ_TOPIC, {
          data,
          retryCount,
          lastError: payload.lastError,
          originalTimestamp: payload.originalTimestamp || Date.now(),
        });

        return;
      }

      console.info(`[ORDER RETRY] retryCount=${retryCount} for order=${orderId}`);

      // back off a little further on every attempt
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)));

      // send event back to MAIN topic for settlement retry
      await publishToKafka(MAIN_TOPIC, {
        data,
        retryCount,
        originalTimestamp: payload.originalTimestamp || Date.now(),
      });

      console.info(`[ORDER RETRY] Re-published to main topic for retry #${retryCount + 1}`);
    },
  });

  console.info(`Order retry consumer started, listening on [${RETRY_TOPIC}]`);
};
