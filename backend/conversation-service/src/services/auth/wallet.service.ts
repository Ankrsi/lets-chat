import axios from "axios";

export async function getWallet(number: string, idToken?: string) {
  try {
    const response = await axios.post(
      `${process.env.AUTH_SERVICE_BASE_URL}/api/v1/phone/get-user-wallet-by-phone`,
      { phoneNumber: Number(number) },
      {
        headers: {
          Authorization: `Bearer ${idToken}`,
          "x-internal-api-key": process.env.INTERNAL_API_KEY,
        },
      },
    );

    return response.data.data;

  } catch (err: any) {
    console.error("Failed to fetch user from wallet-service:", err?.response?.data || err.message);
  }
}