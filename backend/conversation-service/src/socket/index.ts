import { Server, Socket } from "socket.io";
import { createServer } from "http";
import { Express } from "express-serve-static-core";
import { createAdapter } from "@socket.io/redis-adapter";
import { createWorker } from "mediasoup";
import jwt from "jsonwebtoken";
import { getMany, redisSubscriber, redisPublisher, redisClient } from "../redis/redisClient";
import { addSocket, ownerOf, removeSocket } from "./presence";
import { guardSocket } from "./guard";
import { kafka } from "../kafka/kafkaClient";
import { chatHandler } from "./handlers/chatHandler";
import { videoHandler } from "./handlers/videoHandler";
import { groupVideoCallHandler } from "./handlers/groupVideoCallHandler";
import { getConversationMembers, getUserConversationIds } from "../controllers/chats/chats.controller";
import { resolveAnnouncedIp } from "../utils/publicIp";
import AllFriendsContact from "../models/contactModal/allFriendsContact.model";
import { claimOnce } from "../utils/claimOnce";
import { fanOut, socketsOf } from "./fanOut";

declare module "socket.io" {
  interface Socket {
    user?: any;
  }
}

// mediasoup state for group calls (shared with groupVideoCallHandler)
export let worker: any;
export const routers = new Map();
export const userTransports = new Map();
export const transportsById = new Map();
export const producers = new Map();
export const consumers = new Map();

const JWT_PUBLIC_KEY = () => process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, "\n");

/**
 * Someone came online or went offline: only people with one of their chats open need to know
 * (they're in that conversation's room), so emit to those rooms instead of to every socket.
 */
const announcePresence = async (io: Server, phone: string) => {
  const rooms = await getUserConversationIds(phone);
  if (rooms.length) io.to(rooms).emit("chat:updateStatusList");
};

/** Closes a disconnected socket's mediasoup transports, producers and consumers. */
const removeFromGroupCall = (socket: Socket) => {
  const conversationId = socket.data.conversationId;
  const ut = userTransports.get(socket.id);
  if (ut) {
    for (const key of ["sendTransport", "recvTransport"]) {
      const t: any = ut[key];
      if (!t) continue;
      try { t.close(); } catch (e) { console.error("close transport failed", e); }
      transportsById.delete(t.id);
    }
    userTransports.delete(socket.id);
  }

  for (const [pid, entry] of producers) {
    if (entry.socketId !== socket.id) continue;
    try { entry.producer.close(); } catch (e) { console.error("close producer failed", e); }
    producers.delete(pid);
    socket.to(entry.conversationId).emit("producerClosed", { producerId: pid });
  }

  for (const [cid, entry] of consumers) {
    if (entry.socketId !== socket.id) continue;
    try { entry.consumer.close(); } catch (e) { console.error("close consumer failed", e); }
    consumers.delete(cid);
  }

  // Last producer gone: release the room's router
  if (![...producers.values()].some((p) => p.conversationId === conversationId)) {
    const router = routers.get(conversationId);
    if (router) {
      try { router.close(); } catch (e) { console.info(e); }
      routers.delete(conversationId);
      console.info(`Room ${conversationId} auto-cleaned on disconnect`);
    }
  }
};

export const startSocketServer = async (app: Express) => {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    connectionStateRecovery: {},
    adapter: createAdapter(redisPublisher, redisSubscriber),
    transports: ["websocket", "polling"],
    // 25s keeps 1M sockets at ~40k pings/s (5s was 200k/s); drops are noticed within ~45s
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // JWT from auth-service; the payload (with the phone) is kept on the socket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("Authentication required"));
    try {
      socket.user = jwt.verify(token, JWT_PUBLIC_KEY(), { algorithms: ["RS256"], issuer: "auth.superapp" });
      next();
    } catch (err: any) {
      console.error("Socket auth failed:", err?.message);
      next(new Error("Invalid or expired token"));
    }
  });

  const producer = kafka.producer();
  await producer.connect();

  // mediasoup worker for group calls
  (async () => {
    await resolveAnnouncedIp();
    worker = await createWorker({
      rtcMinPort: 10000,
      rtcMaxPort: 20000,
      logLevel: "warn",
      logTags: ["info", "ice", "dtls"],
    });
    worker.on("died", () => console.error("mediasoup worker died"));
  })().catch((e) => console.error("mediasoup worker failed to start", e));

  app.set("io", io);
  app.set("producer", producer);

  io.on("connection", (socket) => {
    console.info("Client connected:", socket.id);
    guardSocket(socket); // sender = verified user, plus per-socket rate limit

    // Map the socket to its user straight away (registerUser from the app refines this)
    (async () => {
      const phone = (await ownerOf(socket.id)) || socket.user?.phone?.toString();
      if (!phone) return;
      await addSocket(phone, socket.id);
      await announcePresence(io, phone);
    })().catch(console.error);

    chatHandler(socket, io, redisPublisher, producer);
    groupVideoCallHandler(socket, redisPublisher);
    videoHandler(socket, io, redisPublisher);

    socket.on("disconnect", async () => {
      removeFromGroupCall(socket);
      try {
        const removed = await removeSocket(socket.id);
        if (removed?.offline) await announcePresence(io, removed.phone);
        if (removed) console.info("Client disconnected:", socket.id);
      } catch (e) {
        console.error("disconnect cleanup failed", e);
      }
    });
  });

  // ── Cross-instance events (Redis pub/sub). claimOnce makes sure one instance handles each. ──

  // New message: live to every socket the members have, and always queued (the app acks it)
  await redisSubscriber.subscribe("chat", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("chat", msg, data.messageId))) return;
      const members = (data.otherMember || []).filter((m: any) => m != data.senderId);
      delete data.otherMember;
      await fanOut({ io, producer, members, event: "chat:recv-message", data, offlineTopic: "offline-chat-messages", alwaysQueue: true });
    } catch (e) {
      console.error("invalid redis chat message", e);
    }
  });

  // Events for the other members of a conversation: live if online, otherwise queued
  const toConversation = (channel: string, event: string, offlineTopic: string, senderField: string, claimKey?: (d: any) => string) =>
    redisSubscriber.subscribe(channel, async (msg) => {
      try {
        const data = JSON.parse(msg);
        const claimed = claimKey ? await claimOnce(channel, msg, claimKey(data)) : await claimOnce(channel, msg, null, 30);
        if (!claimed) return;
        const members = (await getConversationMembers(data.conversationId)).filter((m: any) => String(m) != String(data[senderField]));
        await fanOut({ io, producer, members, event, data, offlineTopic });
      } catch (e) {
        console.error(`invalid redis ${channel} message`, e);
      }
    });

  await toConversation("chat-messages-status", "chat:messageStatusUpdate", "offline-chat-messages-status", "username", (d) => `${d.messageId}:${d.updatedStatus}`);
  await toConversation("chat-delete-messages", "chat:deleteMessages", "offline-delete-messages", "username");
  await toConversation("chat-edit-message", "chat:editMessage", "offline-edit-message", "username");
  await toConversation("update-disappearing-messages", "chat:updateDisappearingMessages", "offline-update-disappearing-messages", "username");
  await toConversation("msgOneview", "chat:one-view", "offline-one-view", "username");

  // Reactions show live only for members who have that chat open; everyone else gets them queued
  await redisSubscriber.subscribe("msgReaction", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("msgReaction", msg, null, 30))) return;
      const members = (await getConversationMembers(data.conversationId)).map(String).filter((m: string) => m != String(data.from));
      const rooms = await getMany(redisClient, members.map((m: string) => `lastChatRoom:${m}`));
      const openHere = new Set(members.filter((_: string, i: number) => rooms[i] == data.conversationId));
      await fanOut({ io, producer, members, event: "chat:msgReaction", data, offlineTopic: "offline-chat-msg-reaction", live: (m) => openHere.has(m) });
    } catch (e) {
      console.error("invalid redis msgReaction message", e);
    }
  });

  // 1:1 call status changes go to the call's participants
  await redisSubscriber.subscribe("audioVideoCallUpdate", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("audioVideoCallUpdate", msg, null, 30))) return;
      const from = data.from;
      delete data.from;
      const call = JSON.parse((await redisClient.get(`audioVideoActiveCall:${data.callId}`)) || "{}");
      const participants: string[] = call.participants || (data?.to ? [data.to] : []);
      const members = participants.filter((m) => !(m == from && data.status == "missed"));
      await fanOut({ io, producer, members, event: "call:audioVideoStatusUpdate", data, offlineTopic: "offline-audio-video-call-status" });
      if (data.status == "ended" && call.participants && call.participants.length <= 1) {
        await redisClient.del(`audioVideoActiveCall:${data.callId}`);
      }
    } catch (e) {
      console.error("invalid redis chat calls status", e);
    }
  });

  // Typing is not stored: emit to the conversation room (the Redis adapter spans instances)
  await redisSubscriber.subscribe("typing", (msg) => {
    try {
      const data = JSON.parse(msg);
      io.to(data.conversationId.toString()).emit("chat:typing", data);
    } catch (e) {
      console.error("invalid redis typing message", e);
    }
  });

  // Someone posted/removed a status: tell their contacts to refresh
  await redisSubscriber.subscribe("chatStatusRefresh", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("chatStatusRefresh", msg, null, 2))) return;
      const friends: any = await AllFriendsContact.findOne({ phone: data.phone.toString() }).select("contacts.phone").lean();
      const phones: string[] = (friends?.contacts ?? []).map((c: any) => c.phone.toString());
      const sockets = (await socketsOf(phones)).flat();
      if (sockets.length) io.to(sockets).emit("chat:chatStatusRefresh");
    } catch (e) {
      console.error("invalid redis chatStatusRefresh message", e);
    }
  });

  // Messages for one person (group keys, resend requests): live if possible, and always queued
  const toPerson = (channel: string, event: string, offlineTopic: string) =>
    redisSubscriber.subscribe(channel, async (msg) => {
      try {
        const data = JSON.parse(msg);
        if (!(await claimOnce(channel, msg, null, 30))) return;
        if (!data.to) return;
        await fanOut({ io, producer, members: [data.to], event, data, offlineTopic, alwaysQueue: true });
      } catch (e) {
        console.error(`invalid redis ${channel} message`, e);
      }
    });

  await toPerson("group-key-chat", "chat:send-group-key", "offline-group-key-chat");
  await toPerson("chat-resend-request", "chat:resend-request", "offline-resend-request");

  // Disappearing / self-destructing timers are Redis keys with a TTL: when one expires, tell
  // the conversation and start the next period
  const DISAPPEARING = /^chatMsg:([a-zA-Z0-9-]+):disappearingMessages$/;
  const DESTRUCTING = /^chatMsg:([a-zA-Z0-9-]+):destructingMessages$/;
  await redisSubscriber.pSubscribe("__keyevent@0__:expired", async (key) => {
    try {
      const disappearing = key.match(DISAPPEARING)?.[1];
      if (disappearing) {
        const ttl = await redisClient.get(`chatMsg:${disappearing}:disappearingMessages:ttl`);
        const members = await getConversationMembers(disappearing);
        await fanOut({
          io, producer, members, event: "chat:disappearingMessages", data: { conversationId: disappearing },
          offlineTopic: "offline-disappearing-messages",
        });
        if (ttl) await redisPublisher.set(`chatMsg:${disappearing}:disappearingMessages`, ttl, { EX: Number(ttl) });
        return;
      }

      const destructing = key.match(DESTRUCTING)?.[1];
      if (destructing) {
        const value = JSON.parse((await redisClient.get(`chatMsg:${destructing}:destructingMessages:data`)) || "{}");
        const members = await getConversationMembers(destructing);
        const data = { conversationId: destructing, senderId: value.senderId, timestamp: value.timestamp };
        await fanOut({ io, producer, members, event: "chat:destructingMessages", data, offlineTopic: "offline-destructing-messages" });
        if (value.ttl) {
          await redisPublisher.set(`chatMsg:${destructing}:disappearingMessages`, String(Number(value.ttl)), { EX: Number(value.ttl) });
          await redisPublisher.set(`chatMsg:${destructing}:destructingMessages:data`, JSON.stringify(value));
        }
      }
    } catch (e) {
      console.error("expired key handler failed", key, e);
    }
  });

  const port = Number(process.env.SOCKET_PORT || 4022);
  httpServer.listen(port, () => console.info(`WebSocket server running on port ${port}`));
};
