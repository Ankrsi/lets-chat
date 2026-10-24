import { Socket, Server } from "socket.io";
import { redisClient } from "../../redis/redisClient";
import { sendAudioVideoFCMNotification } from "../../services/audioVideoFcm.service";
import { getConversationMembers } from "../../controllers/chats/chats.controller";
import { sendBasicFCMNotification } from "../../services/chatBasicFcm.service";

const ttl = 30; // Default TTL of 30 seconds
const callTtl = 4 * 60 * 60; // safety expiry for inCall flags so a leaked one can't block calls forever

export const videoHandler = (socket: Socket, io: Server, redisPublisher: any) => {
  // --- Start Call ---
  socket.on("video:start-call", async ({ callId, from, to, conversationId, callType = "video", switchToVideo = false, timestamp = new Date() }) => {
    console.info("[calling] start call", callId, from, to, conversationId, callType, switchToVideo, timestamp);
    // socket.on("video:start-call", async ({ callId, from, to, conversationId, switchToVideo = false, timestamp = new Date() }) => {
    const userInCall = await redisPublisher.get(`user:${to}:inCall`);
    console.info("[calling] userInCall", userInCall, to);
    let getConvCallLock = await redisPublisher.get(`convCallLock:${conversationId}`);
    if (userInCall === '1' || getConvCallLock === '1') {
      const eventObj = {
        from,
        callId: callId,
        conversationId,
        status: "missed",
        timestamp,
        to
      }
      const event = JSON.stringify(eventObj);
      await redisPublisher.publish("audioVideoCallUpdate", event);
      if (getConvCallLock !== '1') {
        socket.emit("video:InCall", { from, to, reason: "busy" });
      }
      // await redisPublisher.set(`user:${to}:inCall`, '1');
      const message = {
        title: "Missed Call",
        content: "You have a missed call from " + from,
        type: "missed_call",
        senderId: from
      }
      await sendBasicFCMNotification(to.toString(), message);
      return;
    }
    if (getConvCallLock !== '1') {
      await redisPublisher.set(`convCallLock:${conversationId}`, '1', { EX: 5, NX: true });
    }

    let otherMember = await getConversationMembers(conversationId) || [];
    if (Array.isArray(otherMember) && otherMember.length == 2) {
      const isBlocked = await redisClient.sIsMember(
        `blocked:phones:${otherMember[0] == from ? otherMember[1] : otherMember[0]}`,
        String(from)
      );
      if (isBlocked) return;
    }

    const senderSocketId = await redisClient.hGet("userSocketMap", from);

    let participants = Array.isArray(to) ? [...new Set([from, ...to])] : [...new Set([from, to])]
    await redisClient.set(`audioVideoActiveCall:${callId}`, JSON.stringify({ participants, conversationId, connected: false }), { EX: 24 * 60 * 60 }); // 24 hours in seconds

    await redisClient.set(`videoRingTimeout:${callId}`, JSON.stringify({ from, to }), {
      EX: Number(ttl) + 5,
    });

    // await redisPublisher.set(`user:${from}:inCall`, '1');
    // await redisPublisher.set(`user:${from}:inCall:callId`, String(callId));
    // await redisPublisher.set(`user:${to}:inCall`, '1');
    // await redisPublisher.set(`user:${to}:inCall:callId`, String(callId));
    await redisPublisher.set(`user:${from}:inCall`, '1', { EX: callTtl });
    await redisPublisher.set(`user:${from}:inCall:callId`, String(callId), { EX: callTtl });
    await redisPublisher.set(`user:${to}:inCall`, '1', { EX: callTtl });
    await redisPublisher.set(`user:${to}:inCall:callId`, String(callId), { EX: callTtl });

    // await sendAudioVideoFCMNotification(to, {
    //   callId, fromm: from, to, conversationId, messageType: 'video', isIncoming: true, offerType: "initial", switchToVideo, callType, timestamp
    // }, "individual");
    await sendAudioVideoFCMNotification(to, {
      callId, fromm: from, to, conversationId, messageType: 'video', isIncoming: true, offerType: "initial", switchToVideo, callType, timestamp
    }, "individual");
    // await sendAudioVideoFCMNotification(to, {
    //   callId, fromm: from, to, conversationId, messageType: 'video', isIncoming: true, offerType: "initial", switchToVideo, timestamp
    // }, "individual");
    io.to(JSON.parse(senderSocketId!)).emit("video:call-details", { callId, from, to });

    const timeout = setTimeout(
      async () => {
        const videoData = await redisClient.get(`videoRingTimeout:${callId}`);

        // if (!videoData) {
        //   await redisPublisher.del(`user:${from}:inCall`);
        //   await redisPublisher.del(`user:${from}:inCall:callId`);
        //   await redisPublisher.del(`user:${to}:inCall`);
        //   await redisPublisher.del(`user:${to}:inCall:callId`);
        //   clearTimeout(timeout);
        //   return;
        // }
        if (!videoData) {
          let callData: any = await redisClient.get(`audioVideoActiveCall:${callId}`);
          callData = JSON.parse(callData || "{}");
          if (callData.connected === true) return;
          for (const u of [from, to]) {
            const usrCallId = await redisPublisher.get(`user:${u}:inCall:callId`);
            if (usrCallId === String(callId)) {
              await redisPublisher.del(`user:${u}:inCall`);
              await redisPublisher.del(`user:${u}:inCall:callId`);
            }
          }
          return;
        }

        const targetSocketId = await redisClient.hGet("userSocketMap", to) as string;
        io.to(JSON.parse(targetSocketId)).emit("video:missed-call", { from, callId });
        socket.emit("video:missed-call", { from, callId });

        try {
          const eventObj = {
            from,
            callId: callId,
            conversationId,
            status: "missed",
            timestamp
          }
          const event = JSON.stringify(eventObj);
          await redisPublisher.publish("audioVideoCallUpdate", event);
        }
        catch (err) {
          console.error("error saving call (missed):", err);
        }

        await redisPublisher.del(`user:${from}:inCall`);
        await redisPublisher.del(`user:${from}:inCall:callId`);
        await redisPublisher.del(`user:${to}:inCall`);
        await redisPublisher.del(`user:${to}:inCall:callId`);
        await redisPublisher.del(`convCallLock:${conversationId}`);
        await redisClient.del(`videoRingTimeout:${callId}`);
        console.info("[calling] call timeout", callId, from, to);
        clearTimeout(timeout);
      },
      Number(ttl) * 1000,
    );
  });

  // --- timmer ---
  // socket.on("video:missed-call-timmer", async ({ from, callId, conversationId = null, to, timestamp = new Date() }) => {
  //   const timeout = setTimeout(
  //     async () => {
  //       const videoData = await redisClient.get(`videoRingTimeout:${callId}`);

  //       if (!videoData) {
  //         await redisPublisher.del(`user:${from}:inCall`);
  //         await redisPublisher.del(`user:${to}:inCall`);
  //         clearTimeout(timeout);
  //         return;
  //       }

  //       const targetSocketId = await redisClient.hGet("userSocketMap", to) as string;
  //       io.to(JSON.parse(targetSocketId)).emit("video:missed-call", { from, callId });
  //       socket.emit("video:missed-call", { from, callId });

  //       try {
  //         const eventObj = {
  //           from,
  //           callId: callId,
  //           conversationId,
  //           status: "missed",
  //           timestamp
  //         }
  //         const event = JSON.stringify(eventObj);
  //         await redisPublisher.publish("audioVideoCallUpdate", event);
  //       }
  //       catch (err) {
  //         console.error("error saving call (missed):", err);
  //       }

  //       await redisPublisher.del(`user:${from}:inCall`);
  //       await redisPublisher.del(`user:${to}:inCall`);
  //       await redisClient.del(`videoRingTimeout:${callId}`);

  //       clearTimeout(timeout);
  //     },
  //     Number(ttl) * 1000,
  //   );
  // });

  // --- Accept call ---
  socket.on("video:accept-call", async ({ callId, conversationId = null, from, to, timestamp = new Date() }) => {
    console.info("[calling] call accepted", callId, conversationId, from, to, timestamp);
    // await redisPublisher.set(`user:${from}:inCall`, '1');
    // await redisPublisher.set(`user:${to}:inCall`, '1');
    await redisPublisher.del(`convCallLock:${conversationId}`);
    const toSid = await redisClient.hGet("userSocketMap", to);

    await redisClient.del(`videoRingTimeout:${callId}`);

    const eventObj = {
      from,
      callId: callId,
      conversationId,
      status: "connected",
      timestamp
    }
    const event = JSON.stringify(eventObj);
    await redisPublisher.publish("audioVideoCallUpdate", event);

    let data: any = await redisClient.get(`audioVideoActiveCall:${callId}`);
    data = JSON.parse(data || "{}");
    data.connected = true;
    await redisClient.set(`audioVideoActiveCall:${callId}`, JSON.stringify(data), { EX: 24 * 60 * 60 }); // 24 hours in seconds

    // if (toSid) io.to(JSON.parse(toSid)).emit("video:call-accepted", { callId, from });
    socket.emit("video:call-accepted", { callId, from: to });
    io.to(JSON.parse(toSid!)).emit("video:call-started", { callId, to, from });
  });

  // ---reject-call---
  socket.on("video:reject-call", async ({ callId, conversationId = null, from, to, timestamp = new Date() }) => {
    console.info("[calling] call rejected", callId, conversationId, from, to, timestamp);
    await redisPublisher.del(`user:${from}:inCall`);
    await redisPublisher.del(`user:${from}:inCall:callId`);
    await redisPublisher.del(`convCallLock:${conversationId}`);
    let usrCall = await redisPublisher.get(`user:${to}:inCall:callId`);
    if (callId == usrCall) {
      await redisPublisher.del(`user:${to}:inCall`);
      await redisPublisher.del(`user:${to}:inCall:callId`);
    }
    await redisPublisher.del(`audioVideoActiveCall:${callId}`);
    const toSid = await redisClient.hGet("userSocketMap", to);

    const eventObj = {
      from,
      callId: callId,
      conversationId,
      status: "rejected",
      timestamp
    }
    const event = JSON.stringify(eventObj);
    await redisPublisher.publish("audioVideoCallUpdate", event);

    await redisClient.del(`videoRingTimeout:${callId}`);

    if (toSid) io.to(JSON.parse(toSid)).emit("video:call-rejected", { callId, from });
  });

  // ---end-call---
  socket.on("video:end-call", async ({ callId, conversationId = null, from, timestamp = new Date() }) => {
    console.info("[calling] call ended", callId, conversationId, from);
    if (!callId) {
      return;
    }


    await redisPublisher.del(`user:${from}:inCall`);
    await redisPublisher.del(`user:${from}:inCall:callId`);
    await redisPublisher.del(`convCallLock:${conversationId}`);
    await redisClient.del(`videoRingTimeout:${callId}`);

    const eventObj = {
      from,
      callId: callId,
      conversationId,
      status: "ended",
      timestamp
    }

    const event = JSON.stringify(eventObj);
    await redisPublisher.publish("audioVideoCallUpdate", event);
  });

  // --- Add user request ---
  socket.on("video:add-user", async ({ callId, from, username, conversationId, callType }) => {
    console.info("[calling] add user", callId, from, username, conversationId, callType);
    // socket.on("video:add-user", async ({ callId, from, username, conversationId }) => {
    const targetSocketId = await redisClient.hGet("userSocketMap", username);
    if (!targetSocketId) return;

    // io.to(JSON.parse(targetSocketId)).emit("video:add-to-call", { callId, from, username });
    // await sendAudioVideoFCMNotification(username, {
    //   callId, fromm: from, to: username, conversationId, messageType: 'video', isIncoming: true, offerType: "addUser", callType
    // }, "individual");
    await sendAudioVideoFCMNotification(username, {
      callId, fromm: from, to: username, conversationId, messageType: 'video', isIncoming: true, offerType: "addUser", callType
    }, "individual");
    // await sendAudioVideoFCMNotification(username, {
    //   callId, fromm: from, to: username, conversationId, messageType: 'video', isIncoming: true, offerType: "addUser"
    // }, "individual");
  });

  // ---- add user accept ----
  socket.on("video:add-user-accept", async ({ callId, username }) => {
    console.info("[calling] add user accept", callId, username);
    let callData: any = await redisClient.get(`audioVideoActiveCall:${callId}`);
    callData = JSON.parse(callData || "{}");
    let participants = callData.participants || []
    if (!participants) return;
    redisPublisher.set(`user:${username}:inCall`, '1');
    if (!participants.includes(username)) {
      participants.push(username);
      await redisClient.set(`audioVideoActiveCall:${callId}`, JSON.stringify({ participants, conversationId: callData.conversationId }));
    }
    participants.forEach(async (u: any) => {
      if (u !== username) {
        const sid = await redisClient.hGet("userSocketMap", u);
        if (sid) io.to(JSON.parse(sid)).emit("video:user-joined", { username, callId });
      }
    });
  });

  // --- WebRTC signaling handlers ---
  socket.on("video:offer", async ({ from, to, offer }) => {
    console.info("[calling] offer", from, to);
    const targetSocketId = await redisClient.hGet("userSocketMap", to);
    if (targetSocketId) io.to(JSON.parse(targetSocketId)).emit("video:offer", { from, to, offer });
  });

  socket.on("video:answer", async ({ from, to, answer }) => {
    console.info("[calling] answer", from, to);
    const targetSocketId = await redisClient.hGet("userSocketMap", to);
    if (targetSocketId) io.to(JSON.parse(targetSocketId)).emit("video:answer", { from, to, answer });
  });

  socket.on("video:ice-candidate", async ({ from, to, candidate }) => {
    console.info("[calling] ice-candidate", from, to);
    const targetSocketId = await redisClient.hGet("userSocketMap", to);
    if (targetSocketId) io.to(JSON.parse(targetSocketId)).emit("video:ice-candidate", { from, candidate });
  });

  // --- remove user ---
  socket.on("video:remove-user", async ({ username, callId, conversationId, timestamp, status = "ended" }) => {
    console.info("[calling] remove user", username, callId, conversationId, timestamp, status);
    let callData: any = await redisClient.get(`audioVideoActiveCall:${callId}`);
    callData = JSON.parse(callData || "{}");
    let participants = callData.participants || [];
    console.info("video participants", participants);
    if ((participants?.length || 0) <= 2) {
      await redisPublisher.del(`convCallLock:${conversationId}`);
      participants.forEach(async (users: any) => {
        let usrCall = await redisPublisher.get(`user:${users}:inCall:callId`);
        if (usrCall == callId && callData.connected == true) {
          await redisPublisher.del(`user:${users}:inCall`);
          await redisPublisher.del(`user:${users}:inCall:callId`);
        }
        let sid = await redisClient.hGet("userSocketMap", String(users));
        if (sid) io.to(JSON.parse(sid)).emit("video:clear-call", { username, from: users, callId });
      });
      await redisClient.del(`videoRingTimeout:${callId}`);
      const eventObj = {
        from: username,
        callId: callId,
        conversationId,
        status: status,
        timestamp
      }
      const event = JSON.stringify(eventObj);
      await redisPublisher.publish("audioVideoCallUpdate", event);
      // if (deviceType == "ios") {
      let data: any = await redisClient.get(`audioVideoActiveCall:${callId}`);
      data = JSON.parse(data || "{}");
      const otherUser = username == participants[0] ? participants[1] : username
      // const online = await redisPublisher.get(`user:${otherUser}:online`);
      // if (data.connected == false && (online == '0' || online == null)) {
      if (data.connected == false) {
        sendAudioVideoFCMNotification(otherUser, {
          callId, fromm: username, to: "", isIncoming: false, messageType: 'video', offerType: 'CALL_ENDED', callType: 'caller_cancelled'
        }, "individual");
      }
    } else {
      await redisPublisher.del(`user:${username}:inCall`);
      await redisPublisher.del(`user:${username}:inCall:callId`);
      if (participants.includes(username)) {
        participants.splice(participants.indexOf(username), 1);
        await redisClient.set(`audioVideoActiveCall:${callId}`, JSON.stringify({ participants, conversationId: callData.conversationId }));
      }
      participants.forEach(async (users: any) => {
        if (username != users) {
          let sid = await redisClient.hGet("userSocketMap", users);
          if (sid) io.to(JSON.parse(sid)).emit("video:user-remove", { username, callId });
        }
      });
    }
  });

  // ----- upgrade call -------
  socket.on("video:call-type-changed", async ({ from, to, callId, conversationId, type }) => {
    const targetSocketId = await redisClient.hGet("userSocketMap", to);
    if (targetSocketId) {
      io.to(JSON.parse(targetSocketId)).emit("video:call-type-changed", { from, to, callId, conversationId, type });
    }
  });

  socket.on("video:is-call-started", async ({ callId, from, status = "ringing" }) => {
    let callData: any = await redisClient.get(`audioVideoActiveCall:${callId}`);
    callData = JSON.parse(callData || "{}");
    for (const u of callData.participants) {
      const targetSocketId = JSON.parse(await redisClient.hGet("userSocketMap", u) || "[]");
      if (targetSocketId.length > 0) {
        io.to(targetSocketId).emit("video:is-call-started", { from, callId, status });
      }
    }
  });

  socket.on("video:mutedCall", async ({ callId, username, mute = false }) => {
    console.info("[calling] video:mutedCall", callId, username, mute);
    let callData: any = await redisClient.get(`audioVideoActiveCall:${callId}`);
    callData = JSON.parse(callData || "{}");
    console.info("[calling] video:mutedCall", callId, username, mute, callData.participants);
    for (const u of callData.participants) {
      const targetSocketId = JSON.parse(await redisClient.hGet("userSocketMap", u) || "[]");
      if (targetSocketId.length > 0) {
        io.to(targetSocketId).emit("video:mutedCall", { username, callId, mute });
      }
    }
  });

  socket.on("video:holdCall", async ({ callId, username, hold = false }) => {
    console.info("[calling] video:holdCall", callId, username, hold);
    let callData: any = await redisClient.get(`audioVideoActiveCall:${callId}`);
    callData = JSON.parse(callData || "{}");
    console.info("[calling] video:holdCall", callId, username, hold, callData.participants);
    for (const u of callData.participants) {
      const targetSocketId = JSON.parse(await redisClient.hGet("userSocketMap", u) || "[]");
      if (targetSocketId.length > 0) {
        io.to(targetSocketId).emit("video:holdCall", { username, callId, hold });
      }
    }
  });  
};

