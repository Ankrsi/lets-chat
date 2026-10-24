import { Socket } from "socket.io";
import { consumers, producers, routers, transportsById, userTransports, worker } from "..";
import { getConversationMembers } from "../../controllers/chats/chats.controller";
import { redisClient } from "../../redis/redisClient";
import { sendAudioVideoFCMNotification } from "../../services/audioVideoFcm.service";
import { removeMetricsForCall } from "../mediasoupMetrics";
import { getAnnouncedIp } from "../../utils/publicIp";

interface SocketWithTimeouts extends Socket {
  callTimeouts?: { [callId: string]: NodeJS.Timeout };
}

// const ttl = 25; // Default TTL of 25 seconds
const audioLevelObservers = new Map<string, any>();

// export const groupCallHandler = (socket: SocketWithTimeouts, io: Server, producer: any, redisPublisher: any) => {
export const groupCallHandler = (socket: SocketWithTimeouts, redisPublisher: any) => {
  socket.on("group:audio-start-call", async ({ callId, from, conversationId }) => {
    const convInCall = await redisPublisher.get(`user:${conversationId}:inCall`);
    if (convInCall === '1') {
      socket.emit("group:audio-InCall", { reason: "conversaction busy" });
      return;
    }
    await redisPublisher.set(`user:${conversationId}:inCall`, '1');

    let convMember = await getConversationMembers(conversationId);
    let participants = [...new Set([from, ...convMember])]
    await redisClient.set(`audioVideoActiveCall:${callId}`, JSON.stringify({ participants, conversationId, type: "groupAudioCall" }), { EX: 12 * 60 * 60 }); // // 12 hours in seconds
    const targets = convMember.filter(id => id != from);
    for (let member of targets) {
      if (member == from) continue;
      // const toSid = await redisClient.hGet("userSocketMap", member);
      // if (toSid) io.to(JSON.parse(toSid)).emit("group:audio-incoming", { callId, from, conversationId });
      sendAudioVideoFCMNotification(member, {
        callId, fromm: from, to: member, conversationId, isIncoming: true, messageType: 'group_audio', offerType: "initial"
      }, "individual");
    }
  });

  socket.on("joinRoom", async ({ conversationId, userId, callId, timestamp }, cb) => {
    let router = routers.get(conversationId);
    if (!router) {
      router = await worker.createRouter({
        mediaCodecs: [
          { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
          //   { kind: "video", mimeType: "video/VP8", clockRate: 90000 },
        ],
      });
      routers.set(conversationId, router);
      const audioLevelObserver = await router.createAudioLevelObserver({
        maxEntries: 5,       // max simultaneous speakers to track
        threshold: -50,      // dB, below this = silence
        interval: 800,       // check every 500ms
      });
      audioLevelObservers.set(conversationId, audioLevelObserver);
      audioLevelObserver.on("volumes", (volumes: any[]) => {
        const speakers = volumes.map(({ producer, volume }) => {
          return ({
            userId: producer.appData.userId,
            volume,
          })
        });
        socket.to(conversationId).emit("activeSpeakers", speakers);
        socket.emit("activeSpeakers", speakers);
      });
      audioLevelObserver.on("silence", () => {
        socket.to(conversationId).emit("activeSpeakers", []);
        socket.emit("activeSpeakers", []);
      });
    }

    socket.data.conversationId = conversationId;
    socket.data.userId = userId;
    socket.join(conversationId);
    await redisPublisher.set(`user:${userId}:inCall`, '1');

    // get existing producers in this room
    const existingProducers = [];
    for (const [pid, entry] of producers) {
      if (entry.conversationId === conversationId && entry.socketId !== socket.id) {
        existingProducers.push({ producerId: pid, userId: entry.userId });
      }
    }

    if (existingProducers.length > 0) {
      const eventObj = {
        from: userId,
        callId: callId,
        conversationId,
        status: "connected",
        timestamp
      }
      const event = JSON.stringify(eventObj);
      await redisPublisher.publish("audioVideoCallUpdate", event);
    }

    cb({ rtpCapabilities: router.rtpCapabilities, existingProducers });
  });

  // createWebRtcTransport now expects { type: "send" | "recv" }
  socket.on("createTransport", async ({ type }, callback) => {
    try {
      const conversationId = socket.data.conversationId;
      if (!conversationId) return callback({ error: "not joined to a room" });

      const router = routers.get(conversationId);
      if (!router) return callback({ error: "router not found for room" });

      const transport = await router.createWebRtcTransport({
        // listenIps: [{ ip: "0.0.0.0", announcedIp: process.env.IP || '127.0.0.1' }],
        listenIps: [{ ip: "0.0.0.0", announcedIp: getAnnouncedIp() }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      // save per-socket mapping (send/recv) and id mapping
      if (!userTransports.has(socket.id)) userTransports.set(socket.id, {});
      userTransports.get(socket.id)[type === "send" ? "sendTransport" : "recvTransport"] = transport;
      transportsById.set(transport.id, { transport, socketId: socket.id, type: type === "send" ? "send" : "recv", conversationId });

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (err: any) {
      console.error("createWebRtcTransport error:", err);
      callback({ error: err.message || err.toString() });
    }
  });

  socket.on("connectTransport", async ({ transportId, dtlsParameters }, cb) => {
    try {
      const entry = transportsById.get(transportId);
      if (!entry) return cb({ error: "transport not found" });

      await entry.transport.connect({ dtlsParameters });
      cb({ connected: true });
    } catch (err: any) {
      console.error("connectTransport error:", err);
      cb({ error: err.message || err.toString() });
    }
  });

  socket.on("produce", async ({ transportId, kind, rtpParameters, appData }, cb) => {
    try {
      const entry = transportsById.get(transportId);
      if (!entry) return cb({ error: "transport not found" });
      if (entry.socketId !== socket.id) return cb({ error: "transport does not belong to socket" });

      const producer = await entry.transport.produce({
        kind,
        rtpParameters,
        appData: appData ?? { userId: socket.data.userId },
      });
      producers.set(producer.id, { producer, socketId: socket.id, conversationId: socket.data.conversationId, userId: socket.data.userId });

      if (kind === "audio") {
        const observer = audioLevelObservers.get(socket.data.conversationId);
        if (observer) {
          await observer.addProducer({ producerId: producer.id });
          console.info("Producer added to audioLevelObserver:", producer.id);
        }
      }

      // notify peers in room to consume
      socket.to(socket.data.conversationId).emit("newProducer", {
        producerId: producer.id,
        // kind,
        userId: socket.data.userId,
      });

      // cleanup when producer closes
      producer.on("transportclose", () => producers.delete(producer.id));
      producer.on("close", () => producers.delete(producer.id));

      cb({ id: producer.id });
    } catch (err: any) {
      console.error("produce error:", err);
      cb({ error: err.message || err.toString() });
    }
  });

  socket.on("consume", async ({ producerId, rtpCapabilities }, cb) => {
    try {
      const producerEntry = producers.get(producerId);
      if (!producerEntry) return cb({ error: "producer not found" });

      const router = routers.get(producerEntry.conversationId);
      if (!router) return cb({ error: "router not found" });

      if (!router.canConsume({ producerId, rtpCapabilities })) {
        return cb({ error: "cannot consume" });
      }

      const userT = userTransports.get(socket.id);
      if (!userT || !userT.recvTransport) return cb({ error: "no recv transport for consumer" });

      const recvTransport = userT.recvTransport;

      const consumer = await recvTransport.consume({
        producerId,
        rtpCapabilities,
        paused: false,
      });

      await consumer.resume();

      consumers.set(consumer.id, { consumer, socketId: socket.id, conversationId: producerEntry.conversationId });

      // handle cleanup when transport/prod closes
      consumer.on("transportclose", () => consumers.delete(consumer.id));
      consumer.on("producerclose", () => {
        try {
          consumer.close();
        } catch (e: any) {
          console.info(e)
        }
        consumers.delete(consumer.id);
        socket.emit("producerClosed", { producerId });
      });

      cb({
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (err: any) {
      console.error("consume error:", err);
      cb({ error: err.message || err.toString() });
    }
  });

  socket.on("leaveRoom", async ({ userId, conversationId, callId, timestamp }) => {
    let callData = JSON.parse(await redisClient.get(`audioVideoActiveCall:${callId}`) || "{}")
    await redisPublisher.del(`user:${userId}:inCall`);
    let participants = callData.participants || []
    for (let usr of participants) {
      const socketIds = await redisClient.hGet("userSocketMap", String(usr)) || "[]";
      socket.to(JSON.parse(socketIds)).emit("userLeft", { userId });
    }

    for (const [pid, entry] of producers) {
      if (entry.socketId === socket.id) {
        try { entry.producer.close(); } catch (e) {
          console.info(e);
        }
        producers.delete(pid);
        socket.to(conversationId).emit("producerClosed", { producerId: pid });
      }
    }

    for (const [cid, entry] of consumers) {
      if (entry.socketId === socket.id) {
        try { entry.consumer.close(); } catch (e) {
          console.info(e);
        }
        consumers.delete(cid);
      }
    }

    const userT = userTransports.get(socket.id);
    if (userT) {
      ["sendTransport", "recvTransport"].forEach(key => {
        const t = userT[key];
        if (t) t.close();
      });
      userTransports.delete(socket.id);
    }

    const roomStillHasProducers = [...producers.values()].some(
      (p) => p.conversationId === conversationId
    );

    if (!roomStillHasProducers) {
      const router = routers.get(conversationId);
      if (router) {
        try { router.close(); } catch (e) { console.info(e); }
        routers.delete(conversationId);
        removeMetricsForCall(conversationId);
        await redisPublisher.del(`user:${conversationId}:inCall`);
        console.info(`Room ${conversationId} cleaned up — no participants left`);
      }
    }

    socket.leave(conversationId);

    const room = socket.nsp.adapter.rooms.get(conversationId);
    console.info(`User ${userId} left room ${conversationId}. Remaining users: ${room ? room.size : 0}`);
    const remainingUsers = room ? room.size : 0;
    if (remainingUsers < 2) {
      const router = routers.get(conversationId);
      if (router) {
        try { router.close(); } catch (err: any) {
          console.info(err)
        }
        await redisPublisher.del(`user:${conversationId}:inCall`);
        routers.delete(conversationId);
        removeMetricsForCall(conversationId);
      }
      (async () => {
        await redisClient.del(`audioVideoActiveCall:${conversationId}`);
        const eventObj = {
          from: userId,
          callId: callId,
          conversationId,
          status: remainingUsers == 0 ? "missed" : "ended",
          timestamp
        }
        const event = JSON.stringify(eventObj);
        await redisPublisher.publish("audioVideoCallUpdate", event);
      })()
    }
  });

  socket.on("userMuteState", async ({ conversationId, userId, muted }) => {
    try {
      socket.to(conversationId).emit("userMuteState", { userId, muted });
    } catch (err: any) {
      console.error("userMuteState error:", err);
    }
  });

  socket.on("conversations-call-status", async ({ conversationIds }, callback) => {
    try {
      if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
        return callback({ error: "Invalid conversation IDs array" });
      }

      const conversationStatus = await Promise.all(
        conversationIds.map(async (convId) => {
          const convInCall = await redisPublisher.get(`user:${convId}:inCall`);

          let callInfo = {
            isActive: false,
            participants: [],
            callCount: 0,
            type: "groupAudioCall"
          };

          // if (convInCall === '1') {
          const callData = await redisClient.get(`audioVideoActiveCall:${convId}`);

          if (callData) {
            const parsed = JSON.parse(callData);
            callInfo = {
              isActive: true,
              participants: parsed.participants || [],
              callCount: parsed.participants?.length || 0,
              type: parsed.type || "groupAudioCall"
            };
          }
          // }

          return {
            conversationId: convId,
            status: convInCall === '1' ? 'active' : 'inactive',
            callInfo,
          };
        })
      );

      callback({ success: true, conversations: conversationStatus });
    } catch (err: any) {
      console.error("conversations-call-status error:", err);
      callback({ error: err.message || err.toString() });
    }
  });
};
