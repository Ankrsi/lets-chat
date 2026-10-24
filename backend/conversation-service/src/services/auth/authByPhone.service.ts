import axios from "axios";

export async function getAuthByPhone(phone:string) {
    try {
    const response = await axios.get(
      `${process.env.AUTH_SERVICE_BASE_URL}/api/v1/auth/userInfo/${phone}`,
      {
        headers: {
          // Authorization: `Bearer ${idToken}`,
          "x-internal-api-key": process.env.INTERNAL_API_KEY,
        },
      },
    );
    return response.data.data;

  } catch (err: any) {
    console.error("Failed to fetch user from getAuthByPhone service:", err?.response?.data || err.message);
  }
}