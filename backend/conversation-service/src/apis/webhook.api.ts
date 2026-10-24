import axios, { AxiosError } from "axios";
import { ApiError } from "../utils/apiError";

/*
  🌐 Webhook API Call: Sends transaction validation & ACID request 
  to Wallet Service.
*/
export const validateCall = async (payload: any) => {
    try {
        console.info("🌍 Sending validation request to Wallet Service...");
        // console.info("Payload:", payload);

        const webhookResponse = await axios.post(
            `${process.env.WALLET_SERVICE_BASE_URL}/api/v1/webhook/wallet/validate-and-acid`,
            payload,
            {
                headers: {
                    'x-internal-api-key': process.env.INTERNAL_API_KEY
                }
            }
        );

        console.info("📩 Webhook Response (Wallet Service):", webhookResponse.data);

        return webhookResponse.data.data;
    } catch (err) {
        const error = err as AxiosError<any>;

        if (error.response) {
            throw new ApiError(
                error.response.data?.message || "Wallet validation failed",
                error.response.status,
                error.response.data
            );
        }

        if (error.request) {
            throw new ApiError(
                "Wallet service unreachable",
                503
            );
        }

        throw new ApiError(
            "Unexpected error during wallet validation",
            500
        );

        // console.error("❌ Webhook Error (validate-and-acid):", (error as Error).message);
        // throw error
    }
};


// create transaction logs in transaction service:
export const createLog = async (payload: any) => {
    try {
        const webhookResponse = await axios.post(
            `${process.env.TRANSACTION_SERVICE_BASE_URL}/api/v1/webhooks/create-logs`,
            payload,
            {
                headers: {
                    'x-internal-api-key': process.env.INTERNAL_API_KEY
                }
            }
        )
        console.info("📩 Webhook Response (Transaction Service create log):", webhookResponse.data);

        return webhookResponse.data.data;
    } catch (err) {
        const error = err as AxiosError<any>;

        if (error.response) {
            throw new ApiError(
                error.response.data?.message || "Transaction Log create failed",
                error.response.status,
                error.response.data
            );
        }

        if (error.request) {
            throw new ApiError(
                "Transaction service unreachable",
                503
            );
        }

        throw new ApiError(
            "Unexpected error during transaction Log create",
            500
        );

        // console.error("❌ Webhook Error (create log):", (error as Error).message);
        // throw error
    }
}

// save log to mongodb
export const webhookCall = async (url: string, payload: any) => {
    try {
        const webhookResponse = await axios.post(
            url,
            payload,
            {
                headers: {
                    'x-internal-api-key': process.env.INTERNAL_API_KEY
                }
            }
        )
        console.info("📩 Webhook Response (save log to db):", webhookResponse.data);

        return webhookResponse.data;
    } catch (error) {
        console.error("❌ Webhook Error (create log):", (error as Error).message);
        throw error
    }
}