import axios from "axios";

export const updateCryptoOrderPayment = async (data: any) => {
  try {
    // service_id is your MetalTransaction._id
    const orderId =
      data?.meta_data?.service_id || data?.service_id;

    if (!orderId) {
      console.error('Crypto Order ID (service_id) not found in payment data, skipping crypto order update');
      return;
      // throw new Error("Crypto Order ID not found in payment data");
    }

    const payload = {
      orderId,
      transactionId: data?.referenceId
    };

    await axios.post(
      `${process.env.CRYPTO_SERVICE_BASE_URL}/api/v1/metal/payment/success`,
      payload,
      {
        headers: {
          "x-internal-api-key": process.env.INTERNAL_API_KEY,
        },
      }
    );

  } catch (err) {
    console.error(
      "Error while crypto order update |",
      (err as Error).message
    );
  }
};


// Update crypto selling product

export const updateCryptoSellOrderPayment = async (data: any) => {
  try {
    // service_id is your MetalTransaction._id
    const orderId =
      data?.meta_data?.service_id || data?.service_id;

    if (!orderId) {
      console.error('Crypto Sell Order ID (service_id) not found in payment data, skipping crypto sell order update');
      // throw new Error("Crypto Sell Order ID not found in payment data");
      return;
    }

    const payload = {
      orderId,
      transactionId: data?.referenceId,
    };

    await axios.post(
      `${process.env.CRYPTO_SERVICE_BASE_URL}/api/v1/metal/sell/success`,
      payload,
      {
        headers: {
          "x-internal-api-key": process.env.INTERNAL_API_KEY,
        },
      }
    );

    console.info("Sell settlement API triggered successfully");
  } catch (err) {
    console.error(
      "Error while crypto sell order update |",
      (err as Error).message
    );
  }
};