import { Socket, Server } from "socket.io";
import { getConversationMembers } from "../../controllers/chats/chats.controller";
import { getMany, redisClient } from "../../redis/redisClient";
import { addSocket } from "../presence";
import { emitWithAck } from "../../utils/emitWithAck";
import AllFriendsContact from "../../models/contactModal/allFriendsContact.model";
import { TOPICS } from "../../kafka/kafkaClient";

const publishStatus = (redisPub: any, updatedStatus: "delivered" | "read", { messageIds, conversationId, username, timestamp }: any) =>
  Promise.all(
    messageIds.map((messageId: string) =>
      redisPub.publish("chat-messages-status", JSON.stringify({ messageId, updatedStatus, conversationId, username, timestamp })),
    ),
  );

export const chatHandler = (
  socket: Socket,
  io: Server,
  redisPub: any,
  producer: any
) => {
  socket.on("registerUser", ({ senderId }) => {
    if (!senderId) return;
    (async () => {
      // Cache who this user has blocked, so sends can be checked without a DB read
      AllFriendsContact.findOne({ phone: senderId })
        .select("-_id blockedPhones")
        .lean()
        .then(async (data: any) => {
          const blocked: string[] = (data?.blockedPhones ?? []).map(String);
          if (!blocked.length) return;
          await redisClient.multi()
            .del(`blocked:phones:${senderId}`)
            .sAdd(`blocked:phones:${senderId}`, blocked)
            .exec();
        })
        .catch(console.info);

      // Single-device accounts: this registration replaces any sockets left from before
      await addSocket(String(senderId), socket.id, true);

      // "Signed in on another device" notices queued while this user was offline, delivered
      // to the socket that just registered
      const key = `offline:newLogin:${senderId}`;
      const queued = await redisClient.lRange(key, 0, -1);
      for (const msg of queued.reverse()) {
        const msgObj = JSON.parse(msg as string);
        const delivered = msgObj.type == "updateNewLogin"
          && await emitWithAck(io, [socket.id], "chat:updateNewLogin", msgObj.data);
        if (!delivered) break;
        await redisClient.rPop(key);
      }
    })().catch(console.error);
    console.info(`Registered user ${senderId} with socket ${socket.id}`);
  });

  socket.on("chat:join", async ({ conversationId, username }) => {
    if (!conversationId) return;
    socket.join(conversationId.toString());
    await Promise.all([
      addSocket(String(username), socket.id),
      redisClient.set(`lastChatRoom:${username}`, `${conversationId}`),
    ]);
    console.info(`User ${username} joined ${conversationId}`);
  });

  socket.on("chat:send-message", async (payload, ack) => {
    try {
      const {
        messageId,
        conversationId,
        senderId,
        messageType,
        content = {},
        status,
        replyToMessage = null,
        forwarded = false,
        timestamp,
        autoDisappearing = false,
        publicKey = null,
        ephPublicKey = null,
        number = null,
        viewOnce = false,
        version = null,
        conv_type = "single"
      } = payload;
      if (!conversationId || !senderId) return;

      const otherMember = await getConversationMembers(conversationId) || [];
      // Only members can post in a conversation
      if (!otherMember.includes(String(senderId))) {
        if (typeof ack === "function") ack({ success: false, messageId, conversationId, error: "Not a member" });
        return;
      }
      if (otherMember.length == 2) {
        // Blocked: acknowledge so the sender's app stops retrying, but don't deliver
        const isBlocked = await redisClient.sIsMember(
          `blocked:phones:${otherMember[0] == senderId ? otherMember[1] : otherMember[0]}`,
          String(senderId)
        );
        if (isBlocked) {
          if (typeof ack === "function") ack({ success: true, messageId, conversationId });
          return;
        }
      }

      const event = {
        messageId,
        conversationId,
        senderId,
        content,
        replyToMessage,
        messageType,
        status,
        timestamp,
        autoDisappearing,
        forwarded,
        publicKey,
        ephPublicKey,
        number,
        otherMember,
        viewOnce,
        version,
        conv_type
      };
      await redisPub.publish("chat", JSON.stringify(event));
      if (typeof ack === "function") ack({ success: true, messageId, conversationId });
    } catch (err) {
      console.error("chat:send-message error:", err);
    }
  });

  socket.on("chat:markAsDelivered", async ({ messageIds = [], conversationId, username, timestamp = new Date().toISOString() }) => {
    if (!Array.isArray(messageIds) || !messageIds.length) return;
    await publishStatus(redisPub, "delivered", { messageIds, conversationId, username, timestamp }).catch(console.error);
  });

  socket.on("chat:markAsRead", async ({ conversationId, username, messageIds = [], timestamp = new Date().toISOString() }) => {
    if (!Array.isArray(messageIds) || !messageIds.length) return;
    await publishStatus(redisPub, "read", { messageIds, conversationId, username, timestamp }).catch(console.error);
  });

  // Published so every server instance can fan it out
  socket.on("chat:typing", ({ conversationId, username, typing }) => {
    redisPub.publish("typing", JSON.stringify({ conversationId, username, typing })).catch(console.error);
  });

  socket.on("chat:deleteMessages", async ({ conversationId, messageIds = [], username }) => {
    if (!conversationId || !Array.isArray(messageIds) || !messageIds.length) return;
    await redisPub.publish("chat-delete-messages", JSON.stringify({ conversationId, messageIds, username }));
  });

  socket.on("chat:editMessage", async ({ conversationId, messageId, newMessage, username, version = 1, publicKey, ephPublicKey, number, conv_type = "single" }) => {
    if (!conversationId || !messageId) return;
    const event = { conversationId, messageId, newMessage, username, conv_type, version, publicKey, ephPublicKey, number };
    await redisPub.publish("chat-edit-message", JSON.stringify(event));
  });

  // Which of these members are online: one MGET instead of one GET per member
  socket.on("chat:status", async ({ conversationId, username, members = [] }) => {
    try {
      const others: string[] = (members as string[]).filter((m) => m != username);
      const states = await getMany(redisPub, others.map((m) => `user:${m}:online`));
      const online = others.filter((_, i) => states[i] == "1");
      socket.emit("chat:statusList", { conversationId, online });
    } catch (err) {
      console.info("chat:status error:", err);
    }
  });

  socket.on("chat:updateLastChatRoom", async ({ username }) => {
    try {
      await redisClient.del(`lastChatRoom:${username}`);
    } catch (err) {
      console.info("chat:updateLastChatRoom error:", err);
    }
  });

  socket.on("chat:send-group-key", async ({ conversationId, to, senderId, content, publicKey, ephPublicKey, number, name }) => {
    try {
      const event = { conversationId, to, senderId, content, publicKey, ephPublicKey, number, name };
      await redisPub.publish("group-key-chat", JSON.stringify(event));
    } catch (err) {
      console.info("chat:send-group-key error:", err);
    }
  });

  // Receiver could not decrypt these messages and asks the original sender to send them again
  socket.on("chat:resend-request", async ({ kind, to, conversationId, senderId, messageId, content = null }) => {
    try {
      if (!kind || !to || !conversationId || !senderId || !messageId) return;
      await redisPub.publish("chat-resend-request", JSON.stringify({ kind, to, conversationId, senderId, messageId, content }));
    } catch (err) {
      console.info("chat:resend-request error:", err);
    }
  });

  socket.on("chat:one-view", async ({ conversationId, username, messageId, opened = false }) => {
    try {
      await redisPub.publish("msgOneview", JSON.stringify({ conversationId, username, messageId, opened }));
    } catch (err) {
      console.info("chat:one-view error:", err);
    }
  });

  socket.on("chat:msgReaction", async ({ from, emoji, timestamp, conversationId, messageId, type = "add" }) => {
    try {
      await redisPub.publish("msgReaction", JSON.stringify({ from, emoji, timestamp, conversationId, messageId, type }));
    } catch (err) {
      console.info("chat:msgReaction error:", err);
    }
  });

  // Tell the other person a screenshot was taken
  socket.on("chat:screenshot", async ({ myPhone, otherPhone }) => {
    try {
      await producer.send({
        topic: TOPICS.offline,
        messages: [{ key: String(otherPhone), value: JSON.stringify({ kind: "send-screenshot-notify", myPhone, otherPhone }) }],
      });
    } catch (err) {
      console.info("chat:screenshot error:", err);
    }
  });
};
