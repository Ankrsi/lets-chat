import axios from "axios";


export class SocketSupportService {
    static async addMessage(messageData: {
        ticket_id: string;
        sender_type: 'USER' | 'AGENT' | 'SYSTEM';
        sender_id: string;
        message: string;
        image?: string;
    }): Promise<{ _id: string; created_at: Date }> {
        const { ticket_id, sender_type, sender_id, message, image } = messageData;
        const data = await axios.post(
            `${process.env.ADMIN_SUPPORT_SERVICE_BASE_URL}/api/v1/support/tickets/messages/${ticket_id}`,
            {
                sender_type,
                sender_id,
                message,
                image,
            },
            {
                headers: {
                    "x-internal-api-key": process.env.INTERNAL_API_KEY,
                },
            }
        );
        const savedMessage = {
            _id: data.data.id,
            created_at: new Date(),
        };
        return savedMessage;
    }

}