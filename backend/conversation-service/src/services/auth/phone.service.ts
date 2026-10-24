import axios from "axios";

export async function getUsersByPhones(phones: any, role: string = 'individual') {
  try {
    const response = await axios.post(
      `${process.env.AUTH_SERVICE_BASE_URL}/api/v1/auth/get-users-by-phones`,
      { phones, role },
      {
        headers: {
          "x-internal-api-key": process.env.INTERNAL_API_KEY,
        },
      },
    );
    return response.data.data;

  } catch (err: any) {
    console.info("Failed to fetch user from getUsersByPhones service:", err?.response?.data || err.message);
    return [];
  }
}