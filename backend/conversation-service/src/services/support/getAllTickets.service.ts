import axios from "axios";

export async function getAllTicketsService({ userId, limit, skip }: { userId: string; limit: number; skip: number }) {
  try {
    const response = await axios.get(
      `${process.env.ADMIN_SUPPORT_SERVICE_BASE_URL}/api/v1/support/tickets`,
      {
        headers: {
          "x-internal-api-key": process.env.INTERNAL_API_KEY,
        },
        params: {
          user_id: userId,
          limit,
          skip,
        },
      },
    );
    return response.data.data;

  } catch (err: any) {
    console.info("Failed to fetch user from getAllTickets Service:", err?.response?.data || err.message);
    return [];
  }
}