// import { kafka } from "./kafkaClient";
// import axios from "axios";

// const DLQ_TOPIC = "payment-settlement-order-dlq";

// const refundWallet = async (data: any) => {
//   const referenceId = data?.referenceId;
//   const amount = data?.amount;
//   const walletId = data?.walletId;

//   if (!referenceId || !amount || !walletId) {
//     console.error("[ORDER DLQ] Missing refund data:", { referenceId, amount, walletId });
//     return;
//   }

//   try {
//     await axios.post(
//       `${process.env.WALLET_SERVICE_URL}/api/v1/wallet/refund`,
//       {
//         referenceId,
//         amount,
//         walletId,
//         reason: "Order settlement failed after max retries",
//       },
//       {
//         headers: {
//           "x-internal-api-key": process.env.INTERNAL_API_KEY,
//         },
//       }
//     );

//     console.info(`[ORDER DLQ] ✅ Wallet refund triggered for walletId=${walletId}, amount=${amount}`);
//   } catch (err) {
//     console.error(`[ORDER DLQ] ❌ Wallet refund FAILED for walletId=${walletId}:`, (err as Error).message);
//   }
// };

// export const consumeOrderDlq = async () => {
//   const consumer = kafka.consumer({
//     groupId: "order-settlement-dlq-group",
//     retry: { retries: 0 },
//   });

//   await consumer.connect();
//   await consumer.subscribe({ topic: DLQ_TOPIC, fromBeginning: false });

//   await consumer.run({
//     eachMessage: async ({ message }) => {
//       if (!message.value) return;

//       const payload = JSON.parse(message.value.toString());
//       const { data, retryCount, originalTimestamp, failedAt } = payload;

//       console.error(
//         `[ORDER DLQ] Dead-lettered order payment. orderId=${data?.meta_data?.service_id}, retries=${retryCount}, originalTimestamp=${originalTimestamp}, failedAt=${failedAt}`
//       );

//       // Trigger wallet refund
//       await refundWallet(data);
//     },
//   });

//   console.info(`✅ Order DLQ consumer started → listening on [${DLQ_TOPIC}]`);
// };
