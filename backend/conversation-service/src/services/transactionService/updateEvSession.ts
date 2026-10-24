import axios from "axios";

export const updateChargingOrderPayment = async (data: any) => {
  try {
    // service_id = Mongo Charging Order _id
    const orderId = data?.meta_data?.service_id || data?.service_id;

    if (!orderId) {
      console.error("Charging Order ID not found in payment data");

      return;
    }

    const payload = {
      orderId,

      transactionId: data?.referenceId,
    };

    await axios.post(
      `${process.env.EV_SERVICE_BASE_URL}/api/v1/charging-orders/payment-success`,

      payload,

      {
        headers: {
          "x-internal-api-key": process.env.INTERNAL_API_KEY,
        },
      },
    );

    console.info("EV payment success updated");
  } catch (err) {
    console.error("Error while EV order payment update |", (err as Error).message);
  }
};
