import axios from "axios";
import { ApiError } from "../../utils/apiError";
// import AllFriendsContact from "../../models/contactModal/allFriendsContact.model";

export const blockContacts = async (user_phone: string, contact_phone: string) => {
    const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_BASE_URL!
    const internalApiKey = process.env.INTERNAL_API_KEY!;
    try {

        // const friendExists = await AllFriendsContact.exists({
        //     phone: user_phone,
        //     "contacts.phone": contact_phone
        // });

        // if (!friendExists) throw new ApiError("this no present in our contact", 404);

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