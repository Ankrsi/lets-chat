import { Socket } from "socket.io";
import { Producer } from "kafkajs";
import mongoose from "mongoose";
import BotChatMessage from "../../models/chatModal/botChats.model";

export let globalPageSize = 50;

export const botChatHandler = (
  socket: Socket,
  kafkaProducer: Producer,
  redisPub: any,
) => {
  // register user socket
  socket.on("bot:registerUser", async ({ username }) => {
    if (!username) return;
    const existingSockets = await redisPub.hGet("botUserSocketMap", username);
    let socketArray: string[] = existingSockets ? JSON.parse(existingSockets) : [];
    if (!socketArray.includes(socket.id)) socketArray.push(socket.id);
    await redisPub.hSet("botUserSocketMap", username, JSON.stringify(socketArray));
    await redisPub.hSet("botSocketUserMap", socket.id, username);
    console.info(`Registered user ${username} with socket ${socket.id}`);
  });

  // client: { convId, username }
  socket.on("bot:join", async ({ convId, username }) => {
    if (!convId) return;
    const existingSockets = await redisPub.hGet("botUserSocketMap", username);
    let socketArray: string[] = existingSockets ? JSON.parse(existingSockets) : [];
    if (!socketArray.includes(socket.id)) socketArray.push(socket.id);
    await redisPub.hSet("botUserSocketMap", username, JSON.stringify(socketArray));
    await redisPub.hSet("botSocketUserMap", socket.id, username);

    socket.join(convId.toString());
    console.info(`User ${username} joined ${convId}`);

    let history = await redisPub.lRange(`botChat:${convId}`, 0, -1);
    if (history.length > 0) {
      const parsedHistory = history.map((h: any) => JSON.parse(h));
      socket.emit("bot:history", parsedHistory);
    } else {
      const dbHistory = await BotChatMessage.find({ convId })
        .sort({ timestamp: -1 })
        .limit(globalPageSize)
        .lean();
      const ordered = dbHistory.reverse();
      socket.emit("bot:history", ordered);
      if (ordered.length > 0) {
        const pipeline = redisPub.multi();
        ordered.forEach((m) => pipeline.rPush(`botChat:${convId}`, JSON.stringify(m)));
        pipeline.lTrim(`botChat:${convId}`, -globalPageSize, -1);
        await pipeline.exec();
      }
    }
  });

  socket.on("bot:more-history", async ({ convId, page = 1 }) => {
    if (!convId) return;

    const skip = (page - 1) * globalPageSize;

    const dbHistory = await BotChatMessage.find({ convId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(globalPageSize)
      .lean();
    const ordered = dbHistory.reverse();
    socket.emit("bot:recv-more-history", { newMessages: ordered });
  });

  // payload: { convId, senderId, content, attachments }
  socket.on("bot:send-message", async (payload) => {
    try {
      const {
        convId,
        senderId,
        messageType,
        content = "",
        timestamp,
      } = payload;
      if (!convId || !senderId) return;

      const messageId = new mongoose.Types.ObjectId();

      // 1) Save to Mongo
      const event = {
        messageId,
        convId,
        senderId,
        content: {
          msg: content
        },
        messageType,
        status: "sent",
        timestamp,
      };

      // 2) send to Kafka for processing DB save
      await kafkaProducer.send({
        topic: "bot-chat-messages",
        messages: [{ value: JSON.stringify(event) }],
      });

      // 3) Push to Redis for caching/fan-out
      await redisPub.rPush(`botChat:${convId}`, JSON.stringify(event));
      await redisPub.lTrim(`botChat:${convId}`, -globalPageSize, -1);

    } catch (err) {
      console.error("bot:send-message error:", err);
    }
  });
};

