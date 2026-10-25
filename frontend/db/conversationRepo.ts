import { db } from "./sqlite";

const nowIso = new Date().toISOString();

export const saveConversation = async (conv: any) => {
  const existingConv: any = await getConversationById(conv._id);
  if (existingConv && existingConv.active) {
    return;
  }

  await db.runAsync(
    `
    INSERT OR REPLACE INTO conversations (
      id, type, name, avatar,
      admins, groupDescription, members, removedMembers, hiddenFor,
      lastMessageId, lastMessage, lastMessageType,
      lastMessageSenderId, lastMessageStatus, lastMessageDate,
      active, disappearingMessages, disappearingMessagesTime, unreadMsg,
      pinned, blocked, blockedBy, exited, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      conv._id,
      conv.type,
      conv.name ?? null,
      conv.avatar ?? null,

      JSON.stringify(conv.admins ?? []),
      JSON.stringify(conv.groupDescription ?? null),
      JSON.stringify(conv.members ?? []),
      JSON.stringify(conv.removedMembers ?? []),
      JSON.stringify(conv.hiddenFor ?? []),

      conv.lastMessageId ?? null,
      conv.lastMessage ?? null,
      conv.lastMessageType ?? null,
      conv.lastMessageSenderId ?? null,
      conv.lastMessageStatus ?? null,
      conv.lastMessageDate ?? null,

      conv.active === false || conv.active === 0 ? 0 : 1,
      conv.disappearingMessages ? 1 : 0,
      conv.disappearingMessagesTime ?? "off",
      JSON.stringify([]),
      conv.pinned ? 1 : 0,

      conv.blocked ? 1 : 0,
      JSON.stringify(conv.blockedBy ?? []),
      conv.exited ? 1 : 0,

      conv.createdAt ?? nowIso,
      conv.updatedAt ?? nowIso,
    ]
  );
};

export const updateConversationLastMessage = async (conv: any, myId: string) => {
  await db.runAsync(
    `
    UPDATE conversations
    SET
      unreadMsg = CASE
        WHEN ? IS NOT NULL
        THEN json_insert(
          COALESCE(unreadMsg, '[]'),
          '$[#]',
          ?
        )
        ELSE unreadMsg
      END,
      lastMessageId = ?,
      lastMessage = ?,
      lastMessageType = ?,
      lastMessageSenderId = ?,
      lastMessageStatus = ?,
      lastMessageDate = ?
    WHERE id = ?
    `,
    [
      conv.unreadMsg ?? null,
      conv.unreadMsg ?? null,
      conv.lastMessageId ?? null,
      conv.lastMessage ?? null,
      conv.lastMessageType ?? null,
      conv.lastMessageSenderId ?? null,
      conv.lastMessageStatus ?? null,
      conv.lastMessageDate ?? null,
      conv.id
    ]
  ).then(async (data) => {
    if (data.changes === 0) {
      await saveConversation({
        _id: conv.id,
        type: "single",
        members: [conv.lastMessageSenderId, myId],
        unreadMsg: conv.unreadMsg,
        lastMessageId: conv.lastMessageId,
        lastMessage: conv.lastMessage,
        lastMessageType: conv.lastMessageType,
        lastMessageSenderId: conv.lastMessageSenderId,
        lastMessageStatus: conv.lastMessageStatus,
        lastMessageDate: conv.lastMessageDate,
      });
    }
  });
};

// With `onlyIfLastMessageId`, updates only while that message is still the conversation's latest
// (e.g. a group message decrypted late must not overwrite a newer one).
export const updateConversationLastMessageText = async (id: string, lastMessage: string, onlyIfLastMessageId?: string) => {
  if (onlyIfLastMessageId) {
    await db.runAsync(
      `UPDATE conversations SET lastMessage = ? WHERE id = ? AND lastMessageId = ?`,
      [lastMessage ?? null, id, onlyIfLastMessageId]
    )
    return;
  }
  await db.runAsync(
    `UPDATE conversations SET lastMessage = ? WHERE id = ?`,
    [lastMessage ?? null, id]
  )
}

export const getConversationList = async () => {
  try {
    return await db.getAllAsync(`
    SELECT id, type, name, avatar,
      admins, groupDescription, members, removedMembers, active, blocked, exited,
      lastMessage, lastMessageType, lastMessageSenderId, lastMessageStatus, lastMessageDate,
      unreadMsg, pinned
    FROM conversations
    WHERE active = 1 AND (type = 'group' OR lastMessage IS NOT NULL)
    ORDER BY pinned DESC, lastMessageDate DESC, createdAt DESC;
  `);
  } catch (error) {
    console.info("Error fetching conversation list:", error);
    return [];
  }
};

export const getConversationById = async (convId: string) => {
  return await db.getFirstAsync(
    `SELECT id, type, name, avatar,
      admins, groupDescription, members, removedMembers, active, blocked, blockedBy, exited
    FROM conversations WHERE id = ?`,
    [convId]
  );
};

export const getConversationInfoId = async (convId: string) => {
  return await db.getFirstAsync(
    `SELECT * FROM conversations WHERE id = ?`,
    [convId]
  );
};

export const pinnedConversation = async (convIds: string[], pinned: boolean) => {
  if (!convIds.length) return;
  const placeholders = convIds.map(() => "?").join(",");
  await db.runAsync(
    `UPDATE conversations SET pinned = ? WHERE id IN (${placeholders})`,
    [pinned ? 1 : 0, ...convIds]
  );
}

export const deleteConversation = async (convIds: string[], myId: string) => {
  if (!convIds.length) return;
  const placeholders = convIds.map(() => "?").join(",");

  try {
    await db.runAsync(
      `UPDATE conversations SET active = 0, unreadMsg = '[]' WHERE id IN (${placeholders})`,
      convIds
    );

    await db.runAsync(
      `UPDATE messages SET active = 0 WHERE conversationId IN (${placeholders})`,
      convIds
    );
    for (const id of convIds) {
      let conv: any = await getConversationById(id);
      if (conv.members && conv.type === "single") {
        let members = JSON.parse(conv.members);
        let user = members[0] === myId ? members[1] : members[0];
        // Loaded lazily: utils/e2ee imports this file (avoids a require cycle).
        await require("@/utils/e2ee").resetSession(user as string);
      }
    };
  } catch (error) {
    console.error(error)
    throw error;
  }
}

export const getUnreadMessageData = async (convId: string) => {
  return await db.getFirstAsync(
    `SELECT id, unreadMsg FROM conversations WHERE id = ? AND unreadMsg IS NOT NULL AND unreadMsg != '[]'`,
    [convId]
  );
};

export const clearUnreadMessages = async (convId: string) => {
  await db.runAsync(
    `UPDATE conversations SET unreadMsg = ? WHERE id = ?`,
    [JSON.stringify([]), convId]
  );
}

export const setDisappearingMessages = async (id: string, time: string) => {
  await db.runAsync(
    `UPDATE conversations SET disappearingMessages = 1, disappearingMessagesTime = ? WHERE id = ?`,
    [time, id]
  );
}

export const setSelfDestructingMessages = async (id: string, time: string) => {
  await db.runAsync(
    `UPDATE conversations SET destructingMessagesTime = ? WHERE id = ?`,
    [time, id]
  );
}

export const getDisappearingMessage = async (id: string) => {
  return await db.getFirstAsync(
    `SELECT disappearingMessagesTime FROM conversations WHERE id = ?`,
    [id]
  );
}

export const getSelfDestructingMessage = async (id: string) => {
  return await db.getFirstAsync(
    `SELECT destructingMessagesTime FROM conversations WHERE id = ?`,
    [id]
  );
}

export const convBlockMember = async (id: string, blockedBy: string) => {
  const existing = await db.getFirstAsync<{ blockedBy: string | null }>(
    `SELECT blockedBy FROM conversations WHERE id = ?`,
    [id]
  );

  const blockedByArray: string[] = existing?.blockedBy ? JSON.parse(existing.blockedBy) : [];

  if (!blockedByArray.includes(blockedBy)) {
    blockedByArray.push(String(blockedBy));

    await db.runAsync(
      `UPDATE conversations 
       SET blocked = 1, blockedBy = ? 
       WHERE id = ?`,
      [JSON.stringify(blockedByArray), id]
    );
  }

}

export const convUnblockMember = async (id: string, unblockedBy: string) => {
  const existing = await db.getFirstAsync<{ blockedBy: string | null }>(
    `SELECT blockedBy FROM conversations WHERE id = ?`,
    [id]
  );

  const blockedByArray: string[] = existing?.blockedBy ? JSON.parse(existing.blockedBy) : [];

  if (blockedByArray.includes(String(unblockedBy))) {
    const updatedArray: string[] = blockedByArray.filter((user: string) => user != unblockedBy);
    const isBlocked = updatedArray.length > 0 ? 1 : 0;

    await db.runAsync(
      `UPDATE conversations 
       SET blocked = ?, blockedBy = ? 
       WHERE id = ?`,
      [isBlocked, JSON.stringify(updatedArray), id]
    );
  }

  // await db.runAsync(
  //   `
  //   UPDATE conversations
  //   SET
  //     blockedBy = COALESCE(
  //       (
  //         SELECT json_group_array(value)
  //         FROM json_each(conversations.blockedBy)
  //         WHERE value != ?
  //       ),
  //       json('[]')
  //     ),
  //     blocked = CASE
  //       WHEN (
  //         SELECT COUNT(*)
  //         FROM json_each(
  //           COALESCE(
  //             (
  //               SELECT json_group_array(value)
  //               FROM json_each(conversations.blockedBy)
  //               WHERE value != ?
  //             ),
  //             json('[]')
  //           )
  //         )
  //       ) = 0 THEN 0
  //       ELSE 1
  //     END
  //   WHERE id = ?
  //   `,
  //   [unblockedBy, unblockedBy, id]
  // );
}

export const updateGroupProfileName = async (id: string, name: string, avatar: string) => {
  await db.runAsync(
    `UPDATE conversations SET name = ?, avatar = ? WHERE id = ?`,
    [name, avatar, id]
  );
}

export const updateGroupMembers = async (id: string, members: string[], removedMembers: string[]) => {
  await db.runAsync(
    `UPDATE conversations SET members = ?, removedMembers = ? WHERE id = ?`,
    [JSON.stringify(members), JSON.stringify(removedMembers), id]
  );
}

export const removeGroupMembers = async (id: string, members: string[], removedMember: string[]) => {
  await db.runAsync(
    `UPDATE conversations SET members = ?, removedMembers = ? WHERE id = ?`,
    [JSON.stringify(members), JSON.stringify(removedMember), id]
  );
}

export const updateGroupAdmin = async (id: string, admins: string[]) => {
  await db.runAsync(
    `UPDATE conversations SET admins = ? WHERE id = ?`,
    [JSON.stringify(admins), id]
  );
}

export const leaveGroupByID = async (id: string, member: string) => {
  await db.runAsync(
    `
    UPDATE conversations
      SET
        members = (
          SELECT json_group_array(value)
          FROM json_each(conversations.members)
          WHERE value != ?
        ),
        removedMembers = (
          SELECT json_group_array(value)
          FROM (
            SELECT value FROM json_each(COALESCE(conversations.removedMembers, '[]'))
            UNION ALL
            SELECT ?
          )
        ),
        exited = 1
      WHERE id = ?
    `,
    [member, member, id]
  );
};
