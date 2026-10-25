import { Socket, Server } from "socket.io";
import { getMany, redisClient } from "../../redis/redisClient";
import { sendAudioVideoFCMNotification } from "../../services/audioVideoFcm.service";
import { getConversationMembers } from "../../controllers/chats/chats.controller";
import { sendBasicFCMNotification } from "../../services/chatBasicFcm.service";
import { socketsOf } from "../fanOut";

const RING_SECONDS = 30; // unanswered calls become missed after this
const CALL_TTL = 4 * 60 * 60; // safety expiry for inCall flags so a leaked one can't block calls forever
const ACTIVE_CALL_TTL = 24 * 60 * 60;

const readCall = async (callId: string): Promise<any> => {
  try { return JSON.parse((await redisClient.get(`audioVideoActiveCall:${callId}`)) || "{}"); } catch { return {}; }
};

/** Emits to every socket of these users (one HMGET). */
const emitTo = async (io: Server, users: any[], event: string, data: any) => {
  const list = users.filter((u) => u != null).map(String);
  const sockets = (await socketsOf(list)).flat();
  if (sockets.length) io.to(sockets).emit(event, data);
};

const publishCallUpdate = (redisPub: any, update: Record<string, any>) =>
  redisPub.publish("audioVideoCallUpdate", JSON.stringify(update));

export const videoHandler = (socket: Socket, io: Server, redisPublisher: any) => {
  /** Clears users' busy flags; with `callId`, only for users whose current call is that one. */
  const clearInCall = async (users: any[], callId?: string) => {
    const list = users.filter((u) => u != null).map(String);
    if (!list.length) return;
    const current = callId ? await getMany(redisPublisher, list.map((u) => `user:${u}:inCall:callId`)) : [];
    const tx = redisPublisher.multi();
    let n = 0;
    list.forEach((u, i) => {
      if (callId && current[i] !== String(callId)) return;
      tx.del([`user:${u}:inCall`, `user:${u}:inCall:callId`]);
      n++;
    });
    if (n) await tx.exec();
  };

  socket.on("video:start-call", async ({ callId, from, to, conversationId, callType = "video", switchToVideo = false, timestamp = new Date() }) => {
    try {
      console.info("[calling] start call", callId, from, to, conversationId, callType);
      const [userInCall, convLock] = await getMany(redisPublisher, [`user:${to}:inCall`, `convCallLock:${conversationId}`]);

      // Busy (or both calling each other at once): it's a missed call for them
      if (userInCall === "1" || convLock === "1") {
        await publishCallUpdate(redisPublisher, { from, callId, conversationId, status: "missed", timestamp, to });
        if (convLock !== "1") socket.emit("video:InCall", { from, to, reason: "busy" });
        await sendBasicFCMNotification(to.toString(), {
          title: "Missed Call",
          content: "You have a missed call from " + from,
          type: "missed_call",
          senderId: from,
        });
        return;
      }
      await redisPublisher.set(`convCallLock:${conversationId}`, "1", { EX: 5, NX: true });

      const members = await getConversationMembers(conversationId);
      if (members.length == 2) {
        const other = members[0] == from ? members[1] : members[0];
        if (await redisClient.sIsMember(`blocked:phones:${other}`, String(from))) return;
      }

      const participants = Array.isArray(to) ? [...new Set([from, ...to])] : [...new Set([from, to])];
      await Promise.all([
        redisClient.multi()
          .set(`audioVideoActiveCall:${callId}`, JSON.stringify({ participants, conversationId, connected: false }), { EX: ACTIVE_CALL_TTL })
          .set(`videoRingTimeout:${callId}`, JSON.stringify({ from, to }), { EX: RING_SECONDS + 5 })
          .exec(),
        redisPublisher.multi()
          .set(`user:${from}:inCall`, "1", { EX: CALL_TTL })
          .set(`user:${from}:inCall:callId`, String(callId), { EX: CALL_TTL })
          .set(`user:${to}:inCall`, "1", { EX: CALL_TTL })
          .set(`user:${to}:inCall:callId`, String(callId), { EX: CALL_TTL })
          .exec(),
      ]);

      await sendAudioVideoFCMNotification(to, {
        callId, fromm: from, to, conversationId, messageType: "video", isIncoming: true, offerType: "initial", switchToVideo, callType, timestamp
      }, "individual");
      await emitTo(io, [from], "video:call-details", { callId, from, to });

      // Not answered in time: missed call for both sides
      setTimeout(async () => {
        try {
          if (!(await redisClient.get(`videoRingTimeout:${callId}`))) {
            // Answered or cancelled. If it never connected, release whoever is still on this call
            const call = await readCall(callId);
            if (call.connected !== true) await clearInCall([from, to], callId);
            return;
          }
          await emitTo(io, [to], "video:missed-call", { from, callId });
          socket.emit("video:missed-call", { from, callId });
          await publishCallUpdate(redisPublisher, { from, callId, conversationId, status: "missed", timestamp });
          await clearInCall([from, to]);
          await Promise.all([
            redisPublisher.del(`convCallLock:${conversationId}`),
            redisClient.del(`videoRingTimeout:${callId}`),
          ]);
          console.info("[calling] call timeout", callId, from, to);
        } catch (err) {
          console.error("[calling] ring timeout failed", err);
        }
      }, RING_SECONDS * 1000);
    } catch (err) {
      console.error("[calling] start-call failed", err);
    }
  });

  socket.on("video:accept-call", async ({ callId, conversationId = null, from, to, timestamp = new Date() }) => {
    try {
      console.info("[calling] call accepted", callId, from, to);
      await Promise.all([
        redisPublisher.del(`convCallLock:${conversationId}`),
        redisClient.del(`videoRingTimeout:${callId}`),
        publishCallUpdate(redisPublisher, { from, callId, conversationId, status: "connected", timestamp }),
      ]);
      const call = await readCall(callId);
      await redisClient.set(`audioVideoActiveCall:${callId}`, JSON.stringify({ ...call, connected: true }), { EX: ACTIVE_CALL_TTL });

      socket.emit("video:call-accepted", { callId, from: to });
      await emitTo(io, [to], "video:call-started", { callId, to, from });
    } catch (err) {
      console.error("[calling] accept-call failed", err);
    }
  });

  socket.on("video:reject-call", async ({ callId, conversationId = null, from, to, timestamp = new Date() }) => {
    try {
      console.info("[calling] call rejected", callId, from, to);
      await Promise.all([
        clearInCall([from]),
        clearInCall([to], callId),
        redisPublisher.del([`convCallLock:${conversationId}`, `audioVideoActiveCall:${callId}`]),
        redisClient.del(`videoRingTimeout:${callId}`),
        publishCallUpdate(redisPublisher, { from, callId, conversationId, status: "rejected", timestamp }),
      ]);
      await emitTo(io, [to], "video:call-rejected", { callId, from });
    } catch (err) {
      console.error("[calling] reject-call failed", err);
    }
  });

  socket.on("video:end-call", async ({ callId, conversationId = null, from, timestamp = new Date() }) => {
    if (!callId) return;
    try {
      console.info("[calling] call ended", callId, from);
      await Promise.all([
        clearInCall([from]),
        redisPublisher.del(`convCallLock:${conversationId}`),
        redisClient.del(`videoRingTimeout:${callId}`),
      ]);
      await publishCallUpdate(redisPublisher, { from, callId, conversationId, status: "ended", timestamp });
    } catch (err) {
      console.error("[calling] end-call failed", err);
    }
  });

  // Invite another person into a running call (they get a push to join)
  socket.on("video:add-user", async ({ callId, from, username, conversationId, callType }) => {
    try {
      const [sockets] = await socketsOf([String(username)]);
      if (!sockets.length) return;
      await sendAudioVideoFCMNotification(username, {
        callId, fromm: from, to: username, conversationId, messageType: "video", isIncoming: true, offerType: "addUser", callType
      }, "individual");
    } catch (err) {
      console.error("[calling] add-user failed", err);
    }
  });

  socket.on("video:add-user-accept", async ({ callId, username }) => {
    try {
      const call = await readCall(callId);
      const participants: string[] = call.participants || [];
      await redisPublisher.set(`user:${username}:inCall`, "1", { EX: CALL_TTL });
      if (!participants.includes(username)) {
        participants.push(username);
        await redisClient.set(`audioVideoActiveCall:${callId}`, JSON.stringify({ participants, conversationId: call.conversationId }));
      }
      await emitTo(io, participants.filter((u) => u !== username), "video:user-joined", { username, callId });
    } catch (err) {
      console.error("[calling] add-user-accept failed", err);
    }
  });

  // WebRTC signalling: relay to the other side (ICE candidates are frequent, so no logging)
  socket.on("video:offer", ({ from, to, offer }) => {
    emitTo(io, [to], "video:offer", { from, to, offer }).catch(console.error);
  });
  socket.on("video:answer", ({ from, to, answer }) => {
    emitTo(io, [to], "video:answer", { from, to, answer }).catch(console.error);
  });
  socket.on("video:ice-candidate", ({ from, to, candidate }) => {
    emitTo(io, [to], "video:ice-candidate", { from, candidate }).catch(console.error);
  });

  socket.on("video:remove-user", async ({ username, callId, conversationId, timestamp, status = "ended" }) => {
    try {
      console.info("[calling] remove user", username, callId, status);
      const call = await readCall(callId);
      const participants: string[] = call.participants || [];

      if (participants.length <= 2) {
        // 1:1 call: the whole call ends
        await Promise.all([
          redisPublisher.del(`convCallLock:${conversationId}`),
          redisClient.del(`videoRingTimeout:${callId}`),
          call.connected == true ? clearInCall(participants, callId) : Promise.resolve(),
        ]);
        const sockets = await socketsOf(participants.map(String));
        participants.forEach((u, i) => {
          if (sockets[i].length) io.to(sockets[i]).emit("video:clear-call", { username, from: u, callId });
        });
        await publishCallUpdate(redisPublisher, { from: username, callId, conversationId, status, timestamp });

        // Caller hung up before it was answered: stop the ringing on the other phone
        if (call.connected == false) {
          const otherUser = username == participants[0] ? participants[1] : username;
          sendAudioVideoFCMNotification(otherUser, {
            callId, fromm: username, to: "", isIncoming: false, messageType: "video", offerType: "CALL_ENDED", callType: "caller_cancelled"
          }, "individual").catch(console.error);
        }
      } else {
        // Group-sized call: just this person leaves
        await clearInCall([username]);
        if (participants.includes(username)) {
          participants.splice(participants.indexOf(username), 1);
          await redisClient.set(`audioVideoActiveCall:${callId}`, JSON.stringify({ participants, conversationId: call.conversationId }));
        }
        await emitTo(io, participants.filter((u) => u != username), "video:user-remove", { username, callId });
      }
    } catch (err) {
      console.error("[calling] remove-user failed", err);
    }
  });

  socket.on("video:call-type-changed", ({ from, to, callId, conversationId, type }) => {
    emitTo(io, [to], "video:call-type-changed", { from, to, callId, conversationId, type }).catch(console.error);
  });

  // Events every participant of the call gets
  const toParticipants = (event: string, build: (args: any) => any) =>
    socket.on(event, async (args) => {
      try {
        const call = await readCall(args.callId);
        await emitTo(io, call.participants || [], event, build(args));
      } catch (err) {
        console.error(`[calling] ${event} failed`, err);
      }
    });

  toParticipants("video:is-call-started", ({ callId, from, status = "ringing" }) => ({ from, callId, status }));
  toParticipants("video:mutedCall", ({ callId, username, mute = false }) => ({ username, callId, mute }));
  toParticipants("video:holdCall", ({ callId, username, hold = false }) => ({ username, callId, hold }));
};
