import axios from "axios";

// Wallet ODS payment of type INVESTMENT completed: confirm the order in investment-service.
// service_id is the Investment._id returned when the app placed the order.
export const updateInvestmentOrderPayment = async (data: any) => {
  try {
    const orderId = data?.meta_data?.service_id || data?.service_id;

    if (!orderId) {
      console.error("Investment order ID (service_id) not found in payment data, skipping investment update");
      return;
    }

    await axios.post(
      `${process.env.INVESTMENT_SERVICE_BASE_URL}/api/v1/investments/payment/success`,
      {
        orderId,
        transactionId: data?.referenceId,
        // Amount the user intended to pay (before processing fee); investment-service checks it against the order
        amount: data?.meta_data?.principal_amount,
      },
      {
        headers: {
          "x-internal-api-key": process.env.INTERNAL_API_KEY,
        },
        timeout: 15000,
      }
    );

    console.info(`[INVESTMENT] Payment success handled for order ${orderId}`);
  } catch (err: any) {
    console.error(
      "Error while investment order update |",
      err?.response?.data?.message || (err as Error).message
    );
  }
};
