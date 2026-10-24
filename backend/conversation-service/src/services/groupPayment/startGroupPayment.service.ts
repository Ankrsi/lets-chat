import axios from "axios";
import { ApiError } from "../../utils/apiError";
import { t } from "../../../i18n";

const walletBaseUrl = process.env.WALLET_SERVICE_BASE_URL;
const internalKey = process.env.INTERNAL_API_KEY;

interface RecipientPayload {
    idempotency_key: string;
    recipientWalletId: string;
    amount: number;
}

interface GroupPaymentPayload {
    groupId: string;
    groupPaymentKey: string;
    recipients: RecipientPayload[]; // array of recipient objects
    user: any; // sender details
    total_amount: number;  // without fee
    total_users: number;  // total receipients
    lang: string;
    user_notes: string;

    //NEW
    senderWallet: any;
    totalDebit: number;
    feeAmount: number;
    feePercentage: number;
    fee_type: string;
    fee_value: number;
    adminWallet: any;
    senderBlockedUsers: string[]
}

export const startGroupPayment = async (payload: GroupPaymentPayload, lang: string = 'en') => {
    try {
        await axios.post(
            `${walletBaseUrl}/api/v1/wallet/group-payment`,
            payload,
            {
                headers: {
                    'x-internal-api-key': internalKey,
                    'x-lang': lang
                }
            }
        )
    } catch (error: any) {
        const errorMessage = error?.response?.data?.message || error?.message || t("ERROR_WHILE_GROUP_PAYMENT", lang)
        const status = error?.response?.status || 400;

        console.error(errorMessage)
        throw new ApiError(errorMessage, status)
    }
}