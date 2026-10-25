import { Socket } from "socket.io";
import { consumers, producers, routers, transportsById, userTransports, worker } from "..";
import { getConversationMembers } from "../../controllers/chats/chats.controller";
import { getMany, redisClient } from "../../redis/redisClient";
import { sendAudioVideoFCMNotification } from "../../services/audioVideoFcm.service";
import { getAnnouncedIp } from "../../utils/publicIp";
import { socketsOf } from "../fanOut";

interface SocketWithTimeouts extends Socket {
  callTimeouts?: { [callId: string]: NodeJS.Timeout };
}

const videoLevelObservers = new Map<string, any>();

export const groupVideoCallHandler = (socket: SocketWithTimeouts, redisPublisher: any) => {
  socket.on("group:video-start-call", async ({ callId, from, conversationId, callType, timeStamp = Date.now() }) => {
    console.info(`Group call initiated by ${from} for conversation ${conversationId} with callId ${callId} at ${timeStamp}`);
    const convInCall = await redisPublisher.get(`user:${conversationId}:inCall`);
    if (convInCall === '1') {
      socket.emit("group:video-InCall", { reason: "conversaction busy" });
      return;
    }
    await redisPublisher.set(`user:${conversationId}:inCall`, '1');

    let convMember = await getConversationMembers(conversationId);
    let participants = [...new Set([from, ...convMember])]
    let newData = { participants, conversationId, type: callType == "video" ? "groupVideoCall" : "groupAudioCall", connectedUser: [from], host: from };
    await redisClient.set(`audioVideoActiveCall:${callId}`, JSON.stringify(newData), { EX: 12 * 60 * 60 }); // 12 hours in seconds
    // Ring everyone who isn't already in a call (one MGET for all members)
    const targets = convMember.filter(id => id != from);
    const busy = await getMany(redisPublisher, targets.map((m) => `user:${m}:inCall`));
    targets.forEach((member, i) => {
      if (busy[i] === "1") return;
      sendAudioVideoFCMNotification(member, {
        callId, fromm: from, to: member, conversationId, isIncoming: true, messageType: 'group_video', offerType: "initial", callType, timestamp: timeStamp
      }, "individual").catch(console.error);
    });
  });

  socket.on("video:joinRoom", async ({ conversationId, userId, callId, timestamp }, cb) => {
    let router = routers.get(conversationId);
    if (!router) {
      router = await worker.createRouter({
        mediaCodecs: [
          { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
          { kind: "video", mimeType: "video/VP8", clockRate: 90000 },
        ],
      });
      routers.set(conversationId, router);
      const videoLevelObserver = await router.createAudioLevelObserver({
        maxEntries: 5,       // max simultaneous speakers to track
        threshold: -50,      // dB, below this = silence
        interval: 800,       // check every 500ms
      });
      videoLevelObservers.set(conversationId, videoLevelObserver);
      videoLevelObserver.on("volumes", (volumes: any[]) => {
        const speakers = volumes.map(({ producer, volume }) => {
          return ({
            userId: producer.appData.userId,
            volume,
          })
        });
        socket.to(conversationId).emit("video:activeSpeakers", speakers);
        socket.emit("video:activeSpeakers", speakers);
      });
      videoLevelObserver.on("silence", () => {
        socket.to(conversationId).emit("video:activeSpeakers", []);
        socket.emit("video:activeSpeakers", []);
      });
    }

    socket.data.conversationId = conversationId;
    socket.data.userId = userId;
    socket.data.callId = callId;
    socket.join(conversationId);
    await redisPublisher.set(`user:${userId}:inCall`, '1');

    // get existing producers in this room
    const existingProducers = [];
    for (const [pid, entry] of producers) {
      if (entry.conversationId === conversationId && entry.socketId !== socket.id) {
        existingProducers.push({ producerId: pid, userId: entry.userId });
      }
    }

    let data = JSON.parse(await redisClient.get(`audioVideoActiveCall:${callId}`) || "{}");
    let newData = { ...data, connectedUser: [...new Set([...(data.connectedUser || []), String(userId)])] };
    await redisClient.set(`audioVideoActiveCall:${callId}`, JSON.stringify(newData), { EX: 12 * 60 * 60 });

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

    let callType: "audio" | "video" = "video";
    const activeRaw = await redisClient.get(`audioVideoActiveCall:${callId}`);
    if (activeRaw) {
      try {
        const parsed = JSON.parse(activeRaw);
        callType = parsed.callType || (parsed.type === "groupAudioCall" ? "audio" : "video");
      } catch (e) { console.info(e); }
    }

    cb({ rtpCapabilities: router.rtpCapabilities, existingProducers, callType });
  });

  // createWebRtcTransport now expects { type: "send" | "recv" }
  socket.on("video:createTransport", async ({ type }, callback) => {
    try {
      const conversationId = socket.data.conversationId;
      if (!conversationId) return callback({ error: "not joined to a room" });

      const router = routers.get(conversationId);
      if (!router) return callback({ error: "router not found for room" });

      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: "0.0.0.0", announcedIp: getAnnouncedIp() }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      // save per-socket mapping (send/recv) and id mapping
      transport.appData = {
        callId: socket.data.callId
      }
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

  socket.on("video:connectTransport", async ({ transportId, dtlsParameters }, cb) => {
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

  socket.on("video:produce", async ({ transportId, kind, rtpParameters, appData }, cb) => {
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
        const observer = videoLevelObservers.get(socket.data.conversationId);
        if (observer) {
          await observer.addProducer({ producerId: producer.id });
          console.info("Producer added to audioLevelObserver:", producer.id);
        }
      }

      // notify peers in room to consume
      socket.to(socket.data.conversationId).emit("video:newProducer", {
        producerId: producer.id,
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

  socket.on("video:consume", async ({ producerId, rtpCapabilities }, cb) => {
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

      consumer.appData = {
        callId: socket.data.callId
      }

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

  socket.on("video:leaveRoom", async ({ userId, conversationId, callId, timestamp }) => {
    let callData = JSON.parse(await redisClient.get(`audioVideoActiveCall:${callId}`) || "{}")
    await redisPublisher.del(`user:${userId}:inCall`);
    let participants = callData.participants || []
    console.info(`User: ${userId} leaving room: ${conversationId} call id: ${callId}. Participants before leaving:`, participants);
    const sockets = await socketsOf(participants.map(String));
    participants.forEach((usr: any, i: number) => {
      if (!sockets[i].length) return;
      socket.to(sockets[i]).emit("video:userLeft", { userId });
      if (userId == callData.host && usr != userId && callData.connectedUser?.length == 0) {
        socket.to(sockets[i]).emit("video:callCanceled", { from: userId });
      }
    });
    if (callData.connectedUser?.length <= 1) {
      participants.forEach((usr: any) => sendAudioVideoFCMNotification(usr, {
        callId, fromm: userId, to: "", isIncoming: false, messageType: 'group_video', offerType: 'CALL_ENDED', callType: 'caller_cancelled'
      }, "individual").catch(console.error));
    }

    for (const [pid, entry] of producers) {
      if (entry.socketId === socket.id) {
        try { entry.producer.close(); } catch (e) {
          console.info(e);
        }
        producers.delete(pid);
        socket.to(conversationId).emit("video:producerClosed", { producerId: pid });
      }
    }

    for (const [cid, entry] of consumers) {
      if (entry.socketId === socket.id) {
        try { entry.consumer.close(); } catch (err: any) {
          console.info(err)
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
        await redisPublisher.del(`user:${conversationId}:inCall`);
        console.info(`Room ${conversationId} cleaned up — no participants left`);
      }
    }

    socket.leave(conversationId);

    const room = socket.nsp.adapter.rooms.get(conversationId);
    console.info(`User ${userId} left room ${conversationId}. Remaining users: ${room ? room.size : 0}`);
    console.info(`Call data for callId ${callId}:`, callData);
    const remainingUsers = room ? room.size : 0;
    if (remainingUsers < 2) {
      const router = routers.get(conversationId);
      if (router) {
        try { router.close(); } catch (err: any) {
          console.info(err)
        }
        await redisPublisher.del(`user:${conversationId}:inCall`);
        routers.delete(conversationId);
      }
      (async () => {
        await redisClient.del(`audioVideoActiveCall:${conversationId}`);
        const eventObj = {
          from: userId,
          callId: callId,
          conversationId,
          status: callData.connectedUser?.length == 0 ? "missed" : "ended",
          timestamp
        }
        const event = JSON.stringify(eventObj);
        await redisPublisher.publish("audioVideoCallUpdate", event);
      })()
    }
  });

  socket.on("video:userMuteState", async ({ conversationId, userId, muted }) => {
    try {
      socket.to(conversationId).emit("video:userMuteState", { userId, muted });
    } catch (err: any) {
      console.error("userMuteState error:", err);
    }
  });

  socket.on("video:switch-call-type", async ({ callId, conversationId, userId, callType }, cb) => {
    try {
      const mode = callType === "audio" ? "audio" : "video";
      const type = mode === "audio" ? "groupAudioCall" : "groupVideoCall";

      // update stored call so late joiners / status see the new mode
      const raw = await redisClient.get(`audioVideoActiveCall:${callId}`);
      if (raw) {
        const callData = JSON.parse(raw);
        callData.callType = mode;
        callData.type = type;
        await redisClient.set(`audioVideoActiveCall:${callId}`, JSON.stringify(callData), { EX: 12 * 60 * 60 });
      }

      // switching to audio → close this user's VIDEO producer(s); keep audio alive
      if (mode === "audio") {
        for (const [pid, entry] of producers) {
          if (entry.socketId === socket.id && entry.producer.kind === "video") {
            try { entry.producer.close(); } catch (e) { console.info(e); }
            producers.delete(pid);
            socket.to(conversationId).emit("video:producerClosed", { producerId: pid, userId });
          }
        }
      }

      // tell everyone in the room (and confirm to the initiator)
      const payload = { callId, conversationId, userId, callType: mode };
      socket.to(conversationId).emit("video:call-type-switched", payload);
      socket.emit("video:call-type-switched", payload);
      console.info(callId, conversationId, userId, callType, payload);
      if (typeof cb === "function") cb({ success: true, callType: mode });
    } catch (err: any) {
      console.error("switch-call-type error:", err);
      if (typeof cb === "function") cb({ error: err.message || err.toString() });
    }
  });

  socket.on("video:conversations-call-status", async ({ conversationIds }, callback) => {
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
            type: "groupAudioCall",
            callType: "audio",
          };

          const callData = await redisClient.get(`audioVideoActiveCall:${convId}`);

          if (callData) {
            const parsed = JSON.parse(callData);
            callInfo = {
              isActive: true,
              participants: parsed.participants || [],
              callCount: parsed.participants?.length || 0,
              type: parsed.type || "groupVideoCall",
              callType: parsed.callType || (parsed.type === "groupAudioCall" ? "audio" : "video"),
            };
          }

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

  socket.on("video:group_call_started", async ({ to }) => {
    if (!to) return;
    const [targetSocketId] = await socketsOf([String(to)]);
    if (targetSocketId.length > 0) {
      socket.to(targetSocketId).emit("video:group_call_started", { isConnected: true });
    }
  });
};
