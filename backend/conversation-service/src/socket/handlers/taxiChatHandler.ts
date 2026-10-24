import { Socket, Server } from "socket.io";
import { Producer } from "kafkajs";
import mongoose from "mongoose";
import { redisClient } from "../../redis/redisClient";
import { getTaxiConversationLists, getTaxiConversationMembers } from "../../controllers/chats/taxiChats.controller";
import TaxiChatMessage from "../../models/chatModal/taxiChats.model";

export let globalPageSize = 50;

export const taxiChatHandler = (
  socket: Socket,
  kafkaProducer: Producer,
  io: Server,
  redisPub: any,
) => {
  // register user socket
  socket.on("taxi:registerUser", async ({ username }) => {
    if (!username) return;
    const existingSockets = await redisPub.hGet("taxiUserSocketMap", username);
    let socketArray: string[] = existingSockets ? JSON.parse(existingSockets) : [];
    if (!socketArray.includes(socket.id)) socketArray.push(socket.id);
    await redisPub.hSet("taxiUserSocketMap", username, JSON.stringify(socketArray));
    await redisPub.hSet("taxiSocketUserMap", socket.id, username);
    console.info(`Registered user ${username} with socket ${socket.id}`);
  });

  // client: { bookingId, username }
  socket.on("taxi:join", async ({ bookingId, username }) => {
    if (!bookingId) return;
    const existingSockets = await redisPub.hGet("taxiUserSocketMap", username);
    let socketArray: string[] = existingSockets ? JSON.parse(existingSockets) : [];
    if (!socketArray.includes(socket.id)) socketArray.push(socket.id);
    await redisPub.hSet("taxiUserSocketMap", username, JSON.stringify(socketArray));
    await redisPub.hSet("taxiSocketUserMap", socket.id, username);

    socket.join(bookingId.toString());
    console.info(`User ${username} joined ${bookingId}`);

    let history = await redisPub.lRange(`taxiChat:${bookingId}`, 0, -1);
    if (history.length > 0) {
      const parsedHistory = history.map((h: any) => JSON.parse(h));
      socket.emit("taxi:history", parsedHistory);
    } else {
      const dbHistory = await TaxiChatMessage.find({ bookingId })
        .sort({ timestamp: -1 })
        .limit(globalPageSize)
        .lean();
      const ordered = dbHistory.reverse();
      socket.emit("taxi:history", ordered);
      if (ordered.length > 0) {
        const pipeline = redisPub.multi();
        ordered.forEach((m) => pipeline.rPush(`taxiChat:${bookingId}`, JSON.stringify(m)));
        pipeline.lTrim(`taxiChat:${bookingId}`, -globalPageSize, -1);
        await pipeline.exec();
      }
    }
  });

  socket.on("taxi:more-history", async ({ bookingId, page = 1 }) => {
    if (!bookingId) return;

    const skip = (page - 1) * globalPageSize;

    const dbHistory = await TaxiChatMessage.find({ bookingId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(globalPageSize)
      .lean();
    const ordered = dbHistory.reverse();
    socket.emit("taxi:recv-more-history", { newMessages: ordered });
  });

  socket.on("taxi:conversations", async ({ username }) => {
    if (!username) return;
    let convs = await getTaxiConversationLists(username, redisPub);
    socket.emit("taxi:conversationList", convs);
  });

  // When client sends message via socket
  // payload: { bookingId, senderId, content, attachments }
  socket.on("taxi:send-message", async (payload) => {
    try {
      const {
        bookingId,
        senderId,
        messageType,
        content = "",
        timestamp,
      } = payload;
      if (!bookingId || !senderId) return;

      const messageId = new mongoose.Types.ObjectId();

      // 1) Save to Mongo
      const event = {
        messageId,
        bookingId,
        senderId,
        content: {
          msg: content
        },
        messageType,
        status: "sent",
        timestamp,
        role: socket.user.role == "individual" ? "taxi_driver" : "individual",
        senderRole: socket.user.role,
      };

      // 2) send to Kafka for processing DB save
      await kafkaProducer.send({
        topic: "taxi-chat-messages",
        messages: [{ value: JSON.stringify(event) }],
      });

      // 3) Push to Redis for caching/fan-out
      await redisPub.rPush(`taxiChat:${bookingId}`, JSON.stringify(event));
      await redisPub.lTrim(`taxiChat:${bookingId}`, -globalPageSize, -1);

      // 4) notify via Redis pubsub
      await redisPub.publish("taxiChat", JSON.stringify(event));

      // 5) Increment unread counts + notify sockets
      let convMember = await getTaxiConversationMembers(bookingId);
      const pipeline = redisPub.multi();
      for (let member of convMember) {
        let memberSocketId = await redisClient.hGet("taxiUserSocketMap", member);
        if (memberSocketId) {
          memberSocketId = JSON.parse(memberSocketId || "");
          if (memberSocketId) {
            if (member != senderId) {
              pipeline.rPush(`taxiUnread:${bookingId}:${member}`, event.messageId.toString());
            }
            io.to(memberSocketId).emit("taxi:conversationListUpdate", { messageId, bookingId });
          }
        }
      }
      await pipeline.exec();

      // 6) Optionally emit locally too (clients connected to same server)
      // io.to(conversationId.toString()).emit("chat:recv-message", populated);
    } catch (err) {
      console.error("taxi:send-message error:", err);
    }
  });

  socket.on("taxi:isOnline", async ({ username, status = false }) => {
    if (status === true) {
      await redisPub.set(`taxiUser:${username}:online`, "1");
    } else {
      await redisPub.del(`taxiUser:${username}:online`);
    }
  });
};

