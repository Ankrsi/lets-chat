import { db } from "./sqlite";

export const initDB = async () => {

    await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
    `);

    // Conversations (Group + Single) + Messages
    await db.execAsync(
        `
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            type TEXT,
            name TEXT,
            avatar TEXT,
            admins TEXT,
            groupDescription TEXT,
            members TEXT,
            removedMembers TEXT,
            hiddenFor TEXT,

            lastMessageId TEXT,
            lastMessage TEXT,
            lastMessageType TEXT,
            lastMessageSenderId TEXT,
            lastMessageStatus TEXT,
            lastMessageDate TEXT,

            active INTEGER DEFAULT 1,
            disappearingMessages INTEGER DEFAULT 0,
            disappearingMessagesTime TEXT,
            destructingMessagesTime TEXT,
            unreadMsg TEXT,
            pinned INTEGER DEFAULT 0,
            blocked INTEGER DEFAULT 0,
            blockedBy TEXT,
            exited INTEGER DEFAULT 0,

            createdAt TEXT,
            updatedAt TEXT
        );

        CREATE TABLE IF NOT EXISTS messages (
            messageId TEXT PRIMARY KEY,
            conversationId TEXT,

            senderId TEXT,
            messageType TEXT,
            content TEXT,
            reactions TEXT,
            caption TEXT DEFAULT NULL,
            searchText TEXT,

            status TEXT,
            edited INTEGER DEFAULT 0,
            isEditable INTEGER DEFAULT 0,
            forwarded INTEGER DEFAULT 0,
            replyToMessage TEXT,

            active INTEGER DEFAULT 1,
            hiddenFor TEXT,

            timestamp TEXT,
            createdAt TEXT,
            updatedAt TEXT
        );

        CREATE TABLE IF NOT EXISTS message_receipts (
            messageId TEXT NOT NULL,
            conversationId TEXT NOT NULL,
            memberId TEXT NOT NULL,
            status TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            PRIMARY KEY (messageId, conversationId, memberId)
        );

        CREATE INDEX IF NOT EXISTS idx_conv_last_msg
        ON conversations (lastMessageDate DESC);

        CREATE INDEX IF NOT EXISTS idx_msg_conv_time
        ON messages (conversationId, timestamp DESC);

        CREATE INDEX IF NOT EXISTS idx_msg_search
        ON messages (searchText);

        CREATE INDEX IF NOT EXISTS idx_receipts_conversation
        ON message_receipts(conversationId);

        CREATE INDEX IF NOT EXISTS idx_receipts_message
        ON message_receipts(messageId);
    `);

    await db.execAsync(
        `
        CREATE TABLE IF NOT EXISTS calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            callId TEXT NOT NULL UNIQUE,
            callerId TEXT NOT NULL,
            receiverId TEXT NOT NULL,
            status TEXT CHECK (
                status IN ('initiated', 'ringing', 'connected', 'rejected', 'ended', 'missed')
            ) DEFAULT 'initiated',
            type TEXT CHECK (
                type IN ('audio', 'video')
            ) DEFAULT 'audio',
            startedAt DATETIME,
            connectedAt DATETIME,
            endedAt DATETIME,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

    `)

    const messageColumns: { name: string }[] = await db.getAllAsync(
        `PRAGMA table_info(messages);`
    );
    if (!messageColumns.some((column) => column.name === "reactions")) {
        await db.execAsync(`ALTER TABLE messages ADD COLUMN reactions TEXT;`);
    }

    // Receipts keep the latest status per member; these keep each time so "read" doesn't erase "delivered"
    const receiptColumns: { name: string }[] = await db.getAllAsync(
        `PRAGMA table_info(message_receipts);`
    );
    if (!receiptColumns.some((column) => column.name === "deliveredAt")) {
        await db.execAsync(`ALTER TABLE message_receipts ADD COLUMN deliveredAt TEXT;`);
    }
    if (!receiptColumns.some((column) => column.name === "readAt")) {
        await db.execAsync(`ALTER TABLE message_receipts ADD COLUMN readAt TEXT;`);
    }
};
