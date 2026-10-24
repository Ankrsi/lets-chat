import { Socket, Server } from "socket.io";
import { getConversationMembers } from "../../controllers/chats/chats.controller";
import { redisClient } from "../../redis/redisClient";
import { emitWithAck } from "../../utils/emitWithAck";
import AllFriendsContact from "../../models/contactModal/allFriendsContact.model";
import { recordMessageEvent, recordMessageSent } from "../../utils/chatMetrics";

export let globalPageSize = 50;
// const ttl = 86400; // TTL of 1 hour

export const chatHandler = (
  socket: Socket,
  io: Server,
  redisPub: any,
  producer: any
) => {
  // register user socket
  socket.on("registerUser", ({ senderId }) => {
    if (!senderId) return;
    (async () => {
      // userSocketMap.set(senderId, socket.id);
      // redisClient.hSet("userSocketMap", senderId, socket.id);
      // await redisPub.hSet("socketUserMap", socket.id, senderId);
      // let data = await AllFriendsContact.findOne({ phone: senderId }).select("-_id blockedPhones");
      // const blockNo = data?.blockedPhones ?? [];
      // if (blockNo?.length > 0) {
      //   await redisClient.del(`blocked:phones:${senderId}`);
      //   await redisClient.sAdd(`blocked:phones:${senderId}`, blockNo?.map(String));
      // }
      AllFriendsContact.findOne({ phone: senderId })
        .select("-_id blockedPhones")
        .then(async (data) => {
          const blockNo = data?.blockedPhones ?? [];
          if (blockNo.length > 0) {
            await redisClient.del(`blocked:phones:${senderId}`);
            await redisClient.sAdd(`blocked:phones:${senderId}`, blockNo.map(String));
          }
        })
        .catch(console.info);
      // await redisClient.set(`lastChatRoom:${senderId}`, "");
      // const existingSockets = await redisPub.hGet("userSocketMap", senderId.toString());
      // let socketArray: string[] = existingSockets ? JSON.parse(existingSockets) : [];
      // if (!socketArray.includes(socket.id)) socketArray.push(socket.id);
      // await redisPub.hSet("userSocketMap", senderId, JSON.stringify(socketArray));
      // await redisPub.hSet("socketUserMap", socket.id, senderId);
      await redisPub.hSet("userSocketMap", senderId, JSON.stringify([socket.id]));
      await redisPub.hSet("socketUserMap", socket.id, senderId);
      await redisClient.set(`user:${senderId}:online`, "1");

      // const key = `offline:messages:${senderId}`;
      // const messages = await redisClient.lRange(key, 0, -1);
      // let delivered = false;
      // // const userSocketMap = JSON.parse(await redisClient.hGet("userSocketMap", senderId) || "[]");
      // if (Array.isArray(messages)) {
      //   for (const msg of messages.reverse()) {
      //     const msgObj = JSON.parse(msg as string);
      //     if (msgObj.type == "createConversation") {
      //       // socket.emit("chat:otherCreateConversation", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:otherCreateConversation", msgObj.data);
      //     }
      //     else if (msgObj.type == "chatMassageStatus") {
      //       // socket.emit("chat:messageStatusUpdate", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:messageStatusUpdate", msgObj.data);
      //     }
      //     else if (msgObj.type == "chatDeleteMessages") {
      //       // socket.emit("chat:deleteMessages", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:deleteMessages", msgObj.data);
      //     }
      //     else if (msgObj.type == "chatEditMessage") {
      //       // socket.emit("chat:deleteMessages", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:editMessage", msgObj.data);
      //     }
      //     else if (msgObj.type == "updateDisappearingMessages") {
      //       // socket.emit("chat:updateDisappearingMessages", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:updateDisappearingMessages", msgObj.data);
      //     }
      //     else if (msgObj.type == "disappearingMessages") {
      //       // socket.emit("chat:disappearingMessages", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:disappearingMessages", msgObj.data);
      //     }
      //     else if (msgObj.type == "destructingMessages") {
      //       // socket.emit("chat:destructingMessages", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:destructingMessages", msgObj.data);
      //     }
      //     else if (msgObj.type == "blockUser") {
      //       // socket.emit("chat:blockUser", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:blockUser", msgObj.data);
      //     }
      //     else if (msgObj.type == "updateGroupProfileName") {
      //       // socket.emit("chat:updateGroupProfileName", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:updateGroupProfileName", msgObj.data);
      //     }
      //     else if (msgObj.type == "updateConversationMembers") {
      //       // socket.emit("chat:updateConversationMembers", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:updateConversationMembers", msgObj.data);
      //     }
      //     else if (msgObj.type == "removeConversationMembers") {
      //       // socket.emit("chat:removeConversationMembers", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:removeConversationMembers", msgObj.data);
      //     }
      //     else if (msgObj.type == "updateGroupAdmins") {
      //       // socket.emit("chat:updateGroupAdmins", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:updateGroupAdmins", msgObj.data);
      //     }
      //     else if (msgObj.type == "leaveConversationMembers") {
      //       // socket.emit("chat:leaveConversationMembers", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:leaveConversationMembers", msgObj.data);
      //     }
      //     else if (msgObj.type == "audioVideoStatusUpdate") {
      //       // socket.emit("chat:leaveConversationMembers", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "call:audioVideoStatusUpdate", msgObj.data);
      //     }
      //     else if (msgObj.type == "updateNewLogin") {
      //       // socket.emit("chat:leaveConversationMembers", msgObj.data);
      //       const socketArray = msgObj.socketIds;
      //       delivered = await emitWithAck(io, socketArray, "chat:updateNewLogin", msgObj.data);
      //     }
      //     else if (msgObj.type == "groupKeyChat") {
      //       // socket.emit("chat:leaveConversationMembers", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:send-group-key", msgObj.data);
      //     }
      //     else if (msgObj.type == "chatOneView") {
      //       // socket.emit("chat:leaveConversationMembers", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:one-view", msgObj.data);
      //     }
      //     else {
      //       // socket.emit("chat:recv-message", msgObj.data);
      //       delivered = await emitWithAck(io, socketArray, "chat:recv-message", msgObj.data);
      //     }

      //     if (delivered) {
      //       await redisClient.rPop(key);
      //       delivered = false;
      //     }
      //     else {
      //       break;
      //     }
      //   }

      //   if (await redisClient.lLen(key) == 0) {
      //     await redisClient.del(key);
      //   }
      // }
      // console.log(`offline msg send to ${senderId}`);

      const offlineNewLoginKey = `offline:newLogin:${senderId}`;
      const offlineNewLoginMessages = await redisClient.lRange(offlineNewLoginKey, 0, -1);
      let delivered = false;
      if (Array.isArray(offlineNewLoginMessages)) {
        for (const msg of offlineNewLoginMessages.reverse()) {
          const msgObj = JSON.parse(msg as string);
          if (msgObj.type == "updateNewLogin") {
            const socketArray = msgObj.socketIds;
            delivered = await emitWithAck(io, socketArray, "chat:updateNewLogin", msgObj.data);
          }

          if (delivered) {
            await redisClient.rPop(offlineNewLoginKey);
            delivered = false;
          }
          else {
            break;
          }
        }
      }
    })().catch(console.error);
    console.info(`Registered user ${senderId} with socket ${socket.id}`);
  });

  socket.on("chat:join", async ({ conversationId, username }) => {
    if (!conversationId) return;
    const existingSockets = await redisPub.hGet("userSocketMap", username);
    let socketArray: string[] = existingSockets ? JSON.parse(existingSockets) : [];
    if (!socketArray.includes(socket.id)) socketArray.push(socket.id);
    await redisPub.hSet("userSocketMap", username, JSON.stringify(socketArray));
    await redisPub.hSet("socketUserMap", socket.id, username);

    socket.join(conversationId.toString());
    console.info(`User ${username} joined ${conversationId}`);
    await redisClient.set(`lastChatRoom:${username}`, `${conversationId}`);
    await redisClient.set(`currentChatRoom:${username}`, `${conversationId}`);
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

      let otherMember = await getConversationMembers(conversationId) || [];
      if (Array.isArray(otherMember) && otherMember.length == 2) {
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
        content: content,
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

      // Metadata-only counters for the admin dashboard. Counted here rather than
      // in the "chat" subscriber, which runs on every instance and would inflate
      // every metric by the instance count.
      recordMessageSent({
        senderId,
        conversationId,
        messageType,
        convType: conv_type,
        forwarded,
        isReply: Boolean(replyToMessage),
        timestamp,
      });

      if (typeof ack === "function") ack({ success: true, messageId, conversationId });
    } catch (err) {
      console.error("chat:send-message error:", err);
    }
  });

  socket.on("chat:markAsDelivered", async ({ messageIds = [], conversationId, username, timestamp = new Date().toISOString() }) => {
    if (!messageIds && messageIds.length < 1) return;
    recordMessageEvent("delivered", messageIds.length, timestamp);
    for (let messageId of messageIds) {
      // Push to Kafka for processing DB save
      const event = {
        messageId,
        updatedStatus: "delivered",
        conversationId,
        username,
        timestamp,
      };
      await redisPub.publish("chat-messages-status", JSON.stringify(event));
    }
  });

  socket.on("chat:markAsRead", async ({ conversationId, username, messageIds = [], timestamp = new Date().toISOString() }) => {
    if (!messageIds && messageIds.length < 1) return;
    recordMessageEvent("read", messageIds.length, timestamp);
    for (let messageId of messageIds) {
      // Push to Kafka for processing DB save
      const event = {
        messageId,
        updatedStatus: "read",
        conversationId,
        username,
        timestamp,
      };
      await redisPub.publish("chat-messages-status", JSON.stringify(event));
    }
  });

  socket.on("chat:typing", ({ conversationId, username, typing }) => {
    // Publish typing indicator via redis so all servers can fan out
    // Small object: { conversationId, username, typing: true/false, timestamp }
    redisPub
      .publish(
        "typing",
        JSON.stringify({ conversationId, username, typing }),
      )
      .catch(console.error);
  });

  socket.on("chat:deleteMessages", async ({ conversationId, messageIds = [], username }) => {
    if (!conversationId || !messageIds || messageIds.length < 1) return;
    recordMessageEvent("deleted", messageIds.length);
    const event = {
      conversationId,
      messageIds,
      username,
    };
    await redisPub.publish("chat-delete-messages", JSON.stringify(event));
  });

  socket.on("chat:editMessage", async ({ conversationId, messageId, newMessage, username, version = 1, publicKey, ephPublicKey, number, conv_type = "single" }) => {
    if (!conversationId || !messageId) return;
    recordMessageEvent("edited", 1);
    const event = {
      conversationId,
      messageId,
      newMessage,
      username,
      conv_type,
      version,
      publicKey,
      ephPublicKey,
      number,
    };
    await redisPub.publish("chat-edit-message", JSON.stringify(event));
  });

  socket.on("chat:status", async ({ conversationId, username, members = [] }) => {
    try {
      let onlineList: any = []
      for (let nums of members) {
        if (nums == username) continue
        let currentStatus = await redisPub.get(`user:${nums}:online`);
        if ((currentStatus == "1" || currentStatus == 1)) {
          onlineList.push(nums);
        }
      }
      let data = { conversationId, online: onlineList }
      socket.emit("chat:statusList", data);
    }
    catch (err: any) {
      console.info('error:', err)
    }
  });

  socket.on("chat:updateLastChatRoom", async ({ username }) => {
    try {
      console.info(`update Last Chat Room for ${username}`);
      await redisClient.del(`lastChatRoom:${username}`);
    }
    catch (err: any) {
      console.info('error:', err)
    }
  });

  socket.on("chat:send-group-key", async ({ conversationId, to, senderId, content, publicKey, ephPublicKey, number, name }) => {
    try {
      let event = {
        conversationId: conversationId,
        to,
        senderId,
        content,
        publicKey,
        ephPublicKey,
        number,
        name
      }
      await redisPub.publish("group-key-chat", JSON.stringify(event));
    }
    catch (err: any) {
      console.info('error:', err)
    }
  });

  // Receiver could not decrypt these messages and asks the original sender to send them again
  socket.on("chat:resend-request", async ({ kind, to, conversationId, senderId, messageId , content = null }) => {
    try {
      if (!kind || !to || !conversationId || !senderId || !messageId) return;
      let event = { kind, to, conversationId, senderId, messageId, content }
      await redisPub.publish("chat-resend-request", JSON.stringify(event));
    }
    catch (err: any) {
      console.info('error:', err)
    }
  });

  socket.on("chat:one-view", async ({ conversationId, username, messageId, opened = false }) => {
    try {
      let event = {
        conversationId,
        username,
        messageId,
        opened
      }
      await redisPub.publish("msgOneview", JSON.stringify(event));
    }
    catch (err: any) {
      console.info('error:', err)
    }
  });

  socket.on("chat:msgReaction", async ({ from, emoji, timestamp, conversationId, messageId, type = "add" }) => {
    try {
      let event = {
        from,
        emoji,
        timestamp,
        conversationId,
        messageId,
        type
      }
      await redisPub.publish("msgReaction", JSON.stringify(event));
    }
    catch (err: any) {
      console.info('error:', err)
    }
  });

  ////////////// taking Screenshot notification ////////////////
  socket.on("chat:screenshot", async ({ myPhone, otherPhone }) => {
    try {
      producer.send({
        topic: "send-screenshot-notify",
        messages: [{ value: JSON.stringify({ myPhone, otherPhone }) }],
      });
    }
    catch (err: any) {
      console.info('error:', err)
    }
  });
};
