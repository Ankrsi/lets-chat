import axios from "axios";

export async function getTicketChatHistoryService({ ticketId }: { ticketId: string; }) {
  try {
    const response = await axios.get(
      `${process.env.ADMIN_SUPPORT_SERVICE_BASE_URL}/api/v1/support/tickets/${ticketId}/messages`,
      {
        headers: {
          "x-internal-api-key": process.env.INTERNAL_API_KEY,
        },
        params: {
          ticketId: ticketId,
        },
      },
    );
    return response.data.data;

  } catch (err: any) {
    console.info("Failed to fetch user from getTicketChatHistoryService:", err?.response?.data || err.message);
    return [];
  }
}