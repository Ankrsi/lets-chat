import axios from "axios";

export async function createTicketService(ticketData: any) {
  try {
    const response = await axios.post(
      `${process.env.ADMIN_SUPPORT_SERVICE_BASE_URL}/api/v1/support/tickets`,
      { ...ticketData },
      {
        headers: {
          "x-internal-api-key": process.env.INTERNAL_API_KEY,
        },
      },
    );
    return response.data.data;

  } catch (err: any) {
    return err?.response?.data || err.message;
  }
}