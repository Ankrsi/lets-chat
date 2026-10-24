import axios from "axios";
import { publishToKafka } from "../../kafka/kafkaProducer";

/**
 * Settle an e-commerce order once its wallet payment has completed.
 *
 * Throws when the order could not be settled, so the caller can fall back to
 * the Kafka settlement topic instead of losing the payment silently.
 */
export const updateOrderPayment = async (data: any) => {
  // service_id is the OrderNew._id the payment was raised against
  const orderId = data?.meta_data?.service_id || data?.service_id;

  if (!orderId) {
    throw new Error("Order ID (service_id) not found in payment data");
  }

  const payload = {
    payment_status: "paid",
    paidAmount: data?.amount,
    transactionId: data?.referenceId,
    status: "confirmed",
  };

  // The order route is POST /api/v1/order/:id and is idempotent - an already
  // paid payment answers 200 without settling twice.
  await axios.post(`${process.env.ECOMMERCE_SERVICE_URL}/api/v1/order/${orderId}`, payload, {
    headers: {
      "x-internal-api-key": process.env.INTERNAL_API_KEY,
    },
  });

  console.info(`[ORDER] Order ${orderId} settled as paid`);
};

/**
 * Settle an order and never let a settlement problem break the caller.
 *
 * The direct call is what actually clears the order; Kafka is only the
 * fallback for when the e-commerce service is down, and a failure on both
 * is logged rather than thrown so the payer is still notified of their
 * completed transaction.
 */
export const settleEcommerceOrder = async (txn: any) => {
  try {
    await updateOrderPayment(txn);
  } catch (err) {
    console.error(
      "[ORDER] Direct settlement failed, handing over to Kafka |",
      (err as Error).message,
    );

    try {
      await publishToKafka("payment-settlement-order", { data: txn });
      console.info("[ORDER] Payment event published to Kafka, settlement consumer will retry");
    } catch (kafkaErr) {
      console.error(
        "[ORDER] Kafka fallback failed, order left unsettled |",
        (kafkaErr as Error).message,
      );
    }
  }
};
