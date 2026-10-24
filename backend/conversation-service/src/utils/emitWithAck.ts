export const emitWithAck = async (io: any, userSockets: string[], event: string, data: any): Promise<boolean> => {
    try {
        const acks: string[] = await io.to(userSockets)
            .timeout(2000)
            .emitWithAck(event, data);
        return Array.isArray(acks) && acks.length > 0;
    } catch {
        return false;
    }
};
