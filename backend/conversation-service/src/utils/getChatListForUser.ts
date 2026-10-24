import axios from "axios";
import { redisClient } from "../redis/redisClient";
import ChatMessage from "../models/chatModal/chats.model";

export interface ChatItem {
  messageId: string;
  senderId: string;
  receiverId: string;
  content: string;
  unreadCount: number;
  timestamp: string;
  messageType: "text" | "image" | "video" | "location" | "audio" | "file";
  chatId: string;
  status: "sent" | "delivered" | "read";
  user: UserProfile;
}

interface UserProfile {
  userId: string;
  name: string;
  phone: string;
  profile_image?: string;
}

export const getChatListForUser = async (currentUser: string): Promise<ChatItem[]> => {
  const chatList = new Map<string, ChatItem>();

  let redisChatIds: string[] = [];
  let dbChatIds: string[] = [];

  // STEP 1: Get all chat IDs
  try {
    redisChatIds = await redisClient.sMembers(`user:${currentUser}:chatIds`);
  } catch (err) {
    console.error("Failed to fetch chatIds from Redis:", err);
  }

  try {
    dbChatIds = await ChatMessage.distinct("chatId", {
      $or: [{ senderId: currentUser }, { receiverId: currentUser }],
    });
  } catch (err) {
    console.error("Failed to fetch chatIds from DB:", err);
  }

  const allChatIds = Array.from(new Set([...redisChatIds, ...dbChatIds])).filter(
    (id) => !!id && id.includes("-"),
  );

  if (allChatIds.length === 0) return [];

  // STEP 2: Fetch last messages in batch
  const lastMessages: Record<string, any> = {};
  const missingChatIds: string[] = [];

  for (const chatId of allChatIds) {
    try {
      const cachedMsg = await redisClient.get(`chat:${chatId}:lastMessage`);
      if (cachedMsg) {
        lastMessages[chatId] = JSON.parse(cachedMsg);
      } else {
        missingChatIds.push(chatId);
      }
    } catch (err) {
      console.error(`Redis error for chatId ${chatId}:`, err);
      missingChatIds.push(chatId);
    }
  }

  if (missingChatIds.length > 0) {
    try {
      const lastMessagesFromDB = await ChatMessage.aggregate([
        { $match: { chatId: { $in: missingChatIds } } },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: "$chatId",
            message: { $first: "$$ROOT" },
          },
        },
      ]);

      const dbMessages: Record<string, any> = {};
      for (const id of missingChatIds) {
        dbMessages[id] = null;
      }

      for (const entry of lastMessagesFromDB) {
        dbMessages[entry._id] = entry.message;
      }

      for (const [cid, message] of Object.entries(dbMessages)) {
        lastMessages[cid] = message;
        await redisClient.setEx(`chat:${cid}:lastMessage`, 3600, JSON.stringify(message));
      }
    } catch (err) {
      console.error("Failed to fetch last messages from DB:", err);
    }
  }

  // STEP 3: Build set of unique otherUserIds
  const userIdSet = new Set<string>();
  const validChatIds: string[] = [];

  for (const chatId of allChatIds) {
    const msg = lastMessages[chatId];
    if (!msg) continue;

    const otherUserId = msg.senderId === currentUser ? msg.receiverId : msg.senderId;

    if (otherUserId) {
      userIdSet.add(otherUserId);
      validChatIds.push(chatId);
    }
  }

  // STEP 4: Batch fetch user profiles
  const userProfiles: Record<string, UserProfile> = {};
  const uncachedUserIds: string[] = [];

  for (const userId of userIdSet) {
    const cachedProfile = await redisClient.get(`profile:${userId}`);
    if (cachedProfile) {
      userProfiles[userId] = JSON.parse(cachedProfile);
    } else {
      uncachedUserIds.push(userId);
    }
  }

  if (uncachedUserIds.length > 0) {
    try {
      const profileRes = await axios.post(
        `${process.env.AUTH_SERVICE_BASE_URL}/api/v1/profile/user-chat-profiles`,
        { userIds: uncachedUserIds },
        {
          headers: { "x-internal-api-key": process.env.INTERNAL_API_KEY },
        },
      );

      const profiles: Record<string, UserProfile> = profileRes?.data?.data || {};

      for (const [uid, profile] of Object.entries(profiles)) {
        userProfiles[uid] = profile;
        await redisClient.setEx(`profile:${uid}`, 86400, JSON.stringify(profile));
      }
    } catch (err) {
      console.error("Failed to batch fetch user profiles:", err);
    }
  }

  // STEP 5: Build chat list
  for (const chatId of validChatIds) {
    const msg = lastMessages[chatId];
    if (!msg) continue;

    const otherUserId = msg.senderId === currentUser ? msg.receiverId : msg.senderId;
    if (!otherUserId || !userProfiles[otherUserId]) {
      console.info("Skipping chatId due to missing profile", {
        chatId,
        otherUserId,
        hasProfile: !!userProfiles[otherUserId],
      });
      continue;
    }

    let unreadCount = 0;
    try {
      const unreadStr = await redisClient.get(`chat:${chatId}:unread:${currentUser}`);
      unreadCount = unreadStr ? parseInt(unreadStr, 10) : 0;
    } catch (err) {
      console.error(`Failed to fetch unread count for ${chatId}`, err);
    }

    chatList.set(chatId, {
      unreadCount,
      chatId,
      messageId: msg.messageId,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      content: msg.content,
      timestamp: msg.timestamp,
      user: userProfiles[otherUserId],
      status: msg.status || "sent",
      messageType: msg.messageType,
    });
  }

  return Array.from(chatList.values()).sort(
    (a, b) => new Date(b.timestamp || "").getTime() - new Date(a.timestamp || "").getTime(),
  );
};
