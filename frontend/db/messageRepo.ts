import { saveCall } from "./callsRepo";
import { db } from "./sqlite";

const nowIso = new Date().toISOString();

const extractSearchText = (type: string, content: any) => {
    switch (type) {
        case "text":
            return content?.msg || "";

        case "image":
        case "video":
            return content?.url || "";
        case "audio":
            return content?.url || "";

        case "document":
            return content?.name || content?.url || "";
        case "file":
            return content?.url || "";

        case "location":
            return content?.msg || "";

        case "contact":
            return content?.name || "";

        case "money":
        case "money_request":
            return content?.note || "";

        case "disappear":
            return content?.msg || "";
        case "group_create":
            return content?.msg || "";

        default:
            return "";
    }
};

export const saveMessage = async (msg: any) => {
    try {
        await db.runAsync(
            `UPDATE conversations SET active = 1 WHERE id = ?`,
            [msg.conversationId]
        );
    } catch (error) {
        console.info("Error updating conversation status:", error);
    }

    try {
        await db.runAsync(
            `INSERT INTO messages (
            messageId, conversationId,
            senderId, messageType, content, reactions, caption, searchText,
            status, edited, isEditable, forwarded,
            replyToMessage, active, hiddenFor,
            timestamp, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(messageId) DO UPDATE SET
            conversationId = excluded.conversationId,
            senderId = excluded.senderId,
            messageType = excluded.messageType,
            content = excluded.content,
            reactions = COALESCE(excluded.reactions, messages.reactions),
            caption = excluded.caption,
            searchText = excluded.searchText,
            status = excluded.status,
            edited = excluded.edited,
            isEditable = excluded.isEditable,
            forwarded = excluded.forwarded,
            replyToMessage = excluded.replyToMessage,
            active = excluded.active,
            hiddenFor = excluded.hiddenFor,
            timestamp = excluded.timestamp,
            createdAt = excluded.createdAt,
            updatedAt = excluded.updatedAt`,
            [
                msg.messageId,
                msg.conversationId,
                msg.senderId,
                msg.messageType,
                typeof msg.content === "object" ? JSON.stringify(msg.content) : msg.content,
                msg.reactions == null ? null : JSON.stringify(msg.reactions),
                msg.caption ?? null,
                extractSearchText(msg.messageType, msg.content),
                msg.status,
                msg.edited ? 1 : 0,
                msg.isEditable ? 1 : 0,
                msg.forwarded ? 1 : 0,
                typeof msg.content === "object" ? JSON.stringify(msg.replyToMessage) : msg.replyToMessage,
                msg.active ? 1 : msg.active ? 0 : 1,
                JSON.stringify(msg.hiddenFor ?? []),
                msg.timestamp ?? nowIso,
                msg.createdAt ?? nowIso,
                msg.updatedAt ?? nowIso
            ]
        );
    }
    catch (err) {
        console.info(err)
    }

    try {
        if (msg.messageType == "audio_call" || msg.messageType == "video_call") {
            const data = {
                callId: msg.messageId,
                callerId: msg.senderId,
                receiverIds: msg.content.to,
                status: msg.content.status,
                type: msg.messageType,
                startedAt: msg.content.startedAt,
            }
            await saveCall(data);
        }
    } catch (error) {
        console.info("Error saving call data:", error);
    }
};

export const updateMessageReactions = async (conversationId: string, messageId: string, reactions: any) => {
    try {
        await db.runAsync(
            `UPDATE messages SET reactions = ? WHERE messageId = ? AND conversationId = ?`,
            [JSON.stringify(reactions ?? null), messageId, conversationId]
        );
    } catch (error) {
        console.error("Error updating message reactions:", error);
    }
};

export const lastMsgsByConvId = async (convId: string, limit = 50) => {
    try {
        return await db.getAllAsync(
            `
            SELECT * FROM (
                SELECT * FROM messages
                WHERE conversationId = ? AND active = 1
                ORDER BY timestamp DESC
                LIMIT ?
            )
            ORDER BY timestamp ASC
            `,
            [convId, limit]
        );
    }
    catch (error) {
        return [];
    }
}

export const updateMessageStatus = async (conversationId: string, messageId: string, status: string, username: string, timestamp: string) => {
    try {
        await db.runAsync(
            // A late "delivered" never downgrades "read"
            `UPDATE conversations SET lastMessageStatus = ? WHERE lastMessageId = ? AND id = ? AND NOT (lastMessageStatus = 'read' AND ? = 'delivered')`,
            [status, messageId, conversationId, status]
        );
        // await db.runAsync(
        //     `
        //     UPDATE messages
        //     SET
        //         status = ?,
        //         reciverMsgStatus = CASE
        //         WHEN reciverMsgStatus IS NULL OR reciverMsgStatus = ''
        //             THEN json_array(json_object('username', ?, 'status', ?, 'timestamp', ?))
        //         ELSE json_insert(
        //             reciverMsgStatus,'$[#]',json_object('username', ?, 'status', ?, 'timestamp', ?)
        //         )
        //         END
        //     WHERE messageId = ? AND conversationId = ?`,
        //     [status, username, status, timestamp, username, status, timestamp, messageId, conversationId]
        // );
        await db.runAsync(
            `
            UPDATE messages SET status = ? WHERE messageId = ? AND conversationId = ? AND NOT (status = 'read' AND ? = 'delivered')
            `,
            [status, messageId, conversationId, status]
        )
        await db.runAsync(
            `
            INSERT INTO message_receipts
                (messageId, conversationId, memberId, status, timestamp, deliveredAt, readAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(messageId, conversationId, memberId)
            DO UPDATE SET
                status = CASE WHEN message_receipts.status = 'read' THEN 'read' ELSE excluded.status END,
                timestamp = CASE WHEN message_receipts.status = 'read' THEN message_receipts.timestamp ELSE excluded.timestamp END,
                -- first delivery time wins; reading implies delivery if "delivered" never arrived
                deliveredAt = COALESCE(message_receipts.deliveredAt,
                    CASE WHEN message_receipts.status = 'delivered' THEN message_receipts.timestamp END,
                    excluded.deliveredAt),
                readAt = COALESCE(message_receipts.readAt, excluded.readAt)
            `,
            [
                messageId, conversationId, username, status, timestamp,
                // a read receipt also stands in as the delivery time when no delivery receipt came first
                status === "delivered" || status === "read" ? timestamp : null,
                status === "read" ? timestamp : null,
            ]
        );
    } catch (error) {
        console.info("Error updating message status:", error);
    }
};

export const updateMessageData = async (data: any) => {
    try {
        await db.runAsync(
            `
            UPDATE messages SET content = ?, edited = 1 WHERE messageId = ? AND conversationId = ?
            `,
            [JSON.stringify({ msg: data.newMessage }), data.messageId, data.conversationId]
        )
    } catch (error) {
        console.info("Error updating message text:", error);
    }
};

// Replaces a placeholder with the decrypted content once a group sender key arrives.
export const updateMessageContent = async (conversationId: string, messageId: string, content: any, replyToMessage: any) => {
    try {
        const row: any = await db.getFirstAsync(
            `SELECT messageType FROM messages WHERE messageId = ? AND conversationId = ?`,
            [messageId, conversationId]
        );
        if (!row) return;
        if (content != null) {
            await db.runAsync(
                `UPDATE messages SET content = ?, searchText = ? WHERE messageId = ? AND conversationId = ?`,
                [typeof content === "object" ? JSON.stringify(content) : content, extractSearchText(row.messageType, content), messageId, conversationId]
            );
        }
        if (replyToMessage != null) {
            await db.runAsync(
                `UPDATE messages SET replyToMessage = ? WHERE messageId = ? AND conversationId = ?`,
                [typeof replyToMessage === "object" ? JSON.stringify(replyToMessage) : replyToMessage, messageId, conversationId]
            );
        }
    } catch (error) {
        console.info("Error updating message content:", error);
    }
};

export const deleteMessageById = async (id: string, messageIds: string[]) => {
    try {
        const placeholders = messageIds.map(() => '?').join(',');
        await db.runAsync(
            `UPDATE messages SET active = 0 WHERE conversationId = ? AND messageId IN (${placeholders})`,
            [id, ...messageIds]
        );
        await refreshConversationLastMessage(id);
    } catch (error) {
        console.info("Error deleting messages:", error);
    }
}

export const editMessageById = async (id: string, messageId: string, newMessage: string) => {
    try {
        await db.runAsync(
            `UPDATE messages SET content = json_set(content, '$.msg', ?) WHERE conversationId = ? AND messageId = ?`,
            [newMessage, id, messageId]
        );
    } catch (error) {
        console.info("Error editing message:", error);
    }
}

export const clearMessageById = async (id: string) => {
    try {
        await db.runAsync(
            `UPDATE messages SET active = 0 WHERE conversationId = ?`,
            [id]
        );
        await refreshConversationLastMessage(id);
    } catch (error) {
        console.info("Error clearing message:", error);
    }
}

export const clearDisappearingMessages = async (id: string) => {
    try {
        await db.runAsync(
            `UPDATE messages SET active = 0 WHERE conversationId = ?`,
            [id]
        );
        await refreshConversationLastMessage(id);
    } catch (error) {
        console.info("Error clearing disappearing messages:", error);
    }
}

export const clearDestructingMessages = async (id: string, senderId: string, timestamp: string) => {
    try {
        await db.runAsync(
            `UPDATE messages SET active = 0 WHERE conversationId = ? AND senderId = ? AND createdAt >= ? `,
            [id, senderId, timestamp]
        );
        await refreshConversationLastMessage(id);
    } catch (error) {
        console.info("Error clearing destructing messages:", error);
    }
}

export const getMessageReceiptsById = async (messageId: string, conversationId: string) => {
    try {
        return await db.getAllAsync(
            `
        SELECT * FROM message_receipts
        WHERE messageId = ? AND conversationId = ?
        `,
            [messageId, conversationId]
        );
    }
    catch (error) {
        return [];
    }
}

export const getMessageById = async (messageId: string, conversationId: string) => {
    try {
        return await db.getFirstAsync(
            `
            SELECT * FROM messages
            WHERE messageId = ? AND conversationId = ?
            `,
            [messageId, conversationId]
        );
    }
    catch (error) {
        return null;
    }
}

const previewTextOf = (msg: Record<string, any>): string => {
    let c: any = {};
    try { c = typeof msg.content === "string" ? JSON.parse(msg.content || "{}") : (msg.content ?? {}); } catch { c = {}; }
    const caption = Array.isArray(c?.caption) ? c.caption.filter(Boolean).join(" ") : c?.caption;
    return (typeof c?.msg === "string" && c.msg) || caption || c?.name || msg.messageType || "";
};

export const refreshConversationLastMessage = async (id: string) => {
    try {
        const lastMsg: Record<string, any> | null = await db.getFirstAsync(
            `SELECT messageId, content, messageType, senderId, status, timestamp, createdAt
            FROM messages
            WHERE conversationId = ? AND active = 1
            ORDER BY COALESCE(timestamp, createdAt) DESC
            LIMIT 1`,
            [id]
        );

        if (lastMsg) {
            await db.runAsync(
                `UPDATE conversations
                SET lastMessageId = ?,
                    lastMessage = ?,
                    lastMessageType = ?,
                    lastMessageSenderId = ?,
                    lastMessageStatus = ?,
                    lastMessageDate = ?
                WHERE id = ?`,
                [
                    lastMsg.messageId ?? null,
                    previewTextOf(lastMsg),
                    lastMsg.messageType ?? null,
                    lastMsg.senderId ?? null,
                    lastMsg.status ?? null,
                    lastMsg.timestamp ?? lastMsg.createdAt ?? null,
                    id
                ]
            );
        } else {
            // Empty string (not NULL) so the chat stays in the list; the date is kept so it doesn't jump
            await db.runAsync(
                `UPDATE conversations
                SET lastMessageId = NULL,
                    lastMessage = '',
                    lastMessageType = 'text',
                    lastMessageSenderId = NULL,
                    lastMessageStatus = NULL
                WHERE id = ?`,
                [id]
            );
        }
    } catch (error) {
        console.info("Error updating conversation after message delete:", error);
    }
}