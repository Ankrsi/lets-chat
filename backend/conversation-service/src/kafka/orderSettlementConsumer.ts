import { kafka } from "./kafkaClient";
import { publishToKafka } from "./kafkaProducer";
import axios from "axios";

const MAIN_TOPIC = "payment-settlement-order";
const RETRY_TOPIC = "payment-settlement-order-retry";

const settleOrderPayment = async (data: any) => {
  const orderId = data?.meta_data?.service_id;

  if (!orderId) {
    throw new Error("Order ID (service_id) not found in payment data");
  }

  await axios.post(
    `${process.env.ECOMMERCE_SERVICE_URL}/api/v1/order/${orderId}`,
    {
      payment_status: "paid",
      paidAmount: data?.amount,
      transactionId: data?.referenceId,
      status: "confirmed",
    },
    {
      headers: {
        "x-internal-api-key": process.env.INTERNAL_API_KEY,
      },
    },
  );

  console.info(`[ORDER SETTLEMENT] Order ${orderId} marked as paid `);
};

export const consumeOrderSettlements = async () => {
  const consumer = kafka.consumer({
    groupId: "order-settlement-group",
    retry: { retries: 0 }, // manual retry control
  });

  await consumer.connect();
  await consumer.subscribe({ topic: MAIN_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const payload = JSON.parse(message.value.toString());

      const { data, retryCount = 0 } = payload;

      const orderId = data?.meta_data?.service_id;

      try {
        console.info(`[ORDER SETTLEMENT] Processing order ${orderId}, retry=${retryCount}`);

        await settleOrderPayment(data);
      } catch (err) {
        console.error(
          `[ORDER SETTLEMENT] Failed for order ${orderId}, sending to retry`,
          (err as Error).message,
        );

        await publishToKafka(RETRY_TOPIC, {
          data,
          retryCount: retryCount + 1,
          lastError: (err as Error).message,
          originalTimestamp: payload.originalTimestamp || Date.now(),
        });
      }
    },
  });

  console.info(`Order settlement consumer started → listening on [${MAIN_TOPIC}]`);
};
