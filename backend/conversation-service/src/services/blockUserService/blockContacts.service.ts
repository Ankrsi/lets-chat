import axios from "axios";
import { ApiError } from "../../utils/apiError";

export const blockContacts = async (user_phone: string, contact_phone: string) => {
    const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_BASE_URL!
    const internalApiKey = process.env.INTERNAL_API_KEY!;
    try {

        const response = await axios.post(
            `${AUTH_SERVICE_BASE_URL}/api/v1/profile/block-contact`,
            { userPhone: user_phone.toString(), contactNo: contact_phone.toString() },
            { headers: { "x-internal-api-key": internalApiKey } },
        );
        return response.data
    } catch (err) {
        if (axios.isAxiosError(err)) {
            return err.response?.data;
        }
        throw new ApiError(`Error while get blocked contacts ${(err as Error).message}`)
    }
}