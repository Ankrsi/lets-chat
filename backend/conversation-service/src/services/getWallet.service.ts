// services/wallet.service.ts
import axios from "axios";
// import { ApiError } from "../utils/apiError";

const WALLET_SERVICE_BASE_URL = process.env.WALLET_SERVICE_BASE_URL!;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY!;

export const getWalletsByUserId = async (
  userId: string,
): Promise<Record<string, string | null>> => {
  try {
    const { data } = await axios.post(
      `${WALLET_SERVICE_BASE_URL}/api/v1/wallet/get-wallet`,
      { userDetails: [{ user_id: userId, role: "individual" }] },
      { headers: { "x-internal-api-key": INTERNAL_API_KEY } },
    );
    return data.data;
  } catch (err: any) {
    console.error("Wallet fetch error:", err.response?.data || err.message);
    return { error: err.message };
  }
};
