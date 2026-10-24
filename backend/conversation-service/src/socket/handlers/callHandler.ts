import { Socket, Server } from "socket.io";
import { redisClient } from "../../redis/redisClient";
import { sendAudioVideoFCMNotification } from "../../services/audioVideoFcm.service";
import { getConversationMembers } from "../../controllers/chats/chats.controller";

interface SocketWithTimeouts extends Socket {
  callTimeouts?: { [callId: string]: NodeJS.Timeout };
}

const ttl = 30; // Default TTL of 30 seconds

export const callHandler = (socket: SocketWithTimeouts, io: Server, redisPublisher: any) => {
  socket.callTimeouts = {};

  // 1) Register is done in chatHandler
  // 2) Caller sends an OFFER to a target mobile number
  socket.on("call:offer", async ({ callId, from, to, offer, conversationId = null, timestamp }) => {
    const userInCall = await redisPublisher.get(`user:${to}:inCall`);
    if (userInCall === '1') {
      socket.emit("call:InCall", { from, to, reason: "busy" });
      return;
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
    const targetSocket = await redisClient.hGet("userSocketMap", to);

    let participants = Array.isArray(to) ? [...new Set([from, ...to])] : [...new Set([from, to])]
    await redisClient.set(`audioVideoActiveCall:${callId}`, JSON.stringify({ participants, conversationId }), { EX: 24 * 60 * 60 }); // // 24 hours in seconds

    await redisPublisher.set(`user:${from}:inCall`, '1');
    await redisPublisher.set(`user:${from}:inCall:callId`, callId);
    await redisPublisher.set(`user:${to}:inCall`, '1');
    await redisPublisher.set(`user:${to}:inCall:callId`, callId);

    sendAudioVideoFCMNotification(to, {
      callId, fromm: from, to, offer, conversationId, isIncoming: true, messageType: 'audio', offerType: "initial", timestamp
    }, "individual");

    io.to(JSON.parse(senderSocketId!)).emit("call:call-details", { callId, from, to });

    await redisClient.set(`callRingTimeout:${callId}`, JSON.stringify({ from, to }), {
      EX: Number(ttl) + 5,
    });

    const timeout = setTimeout(
      async () => {
        const callData = await redisClient.get(`callRingTimeout:${callId}`);
        if (!callData) {
          clearTimeout(timeout);
          await redisPublisher.del(`user:${to}:inCall`);
          await redisPublisher.del(`user:${from}:inCall`);
          return;
        }

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

        await redisPublisher.del(`user:${to}:inCall`);
        await redisPublisher.del(`user:${from}:inCall`);

        socket.emit("call:released", { callId, from, reason: "no-answer" });
        io.to(JSON.parse(targetSocket || "[]")).emit("call:released", { from, reason: "no-answer" });

        delete socket.callTimeouts?.[callId];
        await redisClient.del(`callRingTimeout:${callId}`);

        clearTimeout(timeout);
      },
      Number(ttl) * 1000,
    );

    if (!socket.callTimeouts) socket.callTimeouts = {};
    socket.callTimeouts[callId] = timeout;
  });

  // 3) ICE candidates exchange
  socket.on("call:ice-candidate", async ({ callId, from, to, candidate }) => {
    const targetSocket = await redisClient.hGet("userSocketMap", to);
    if (!targetSocket) return;
    io.to(JSON.parse(targetSocket)).emit("call:ice-candidate", { callId, from, to, candidate });
  });

  // 4) Callee answers with an ANSWER back to caller
  socket.on("call:answer", async ({ callId, from, to, answer }) => {
    const targetSocket = await redisClient.hGet("userSocketMap", to);
    if (!targetSocket) return;
    io.to(JSON.parse(targetSocket)).emit("call:answer", { callId, from, answer });
  });

  // 6) Call connected Stop Timmer
  socket.on("call:connect", async ({ callId, conversationId = null, to, from, timestamp = new Date().toISOString() }) => {
    await redisClient.del(`callRingTimeout:${callId}`);
    await redisPublisher.set(`user:${to}:inCall`, '1');
    await redisPublisher.set(`user:${from}:inCall`, '1');
    const targetSocket = await redisClient.hGet("userSocketMap", to);
    if (!targetSocket) return;
    const eventObj = {
      from,
      callId: callId,
      conversationId,
      status: "connected",
      timestamp
    }
    const event = JSON.stringify(eventObj);
    await redisPublisher.publish("audioVideoCallUpdate", event);
    io.to(JSON.parse(targetSocket)).emit("call:connected", { callId, from, to });
  });

  // 7) Stop Timmer call (either side)
  socket.on("call:stopTimer", async ({ callId }) => {
    await redisClient.del(`callRingTimeout:${callId}`);
    if (socket.callTimeouts?.[callId]) {
      clearTimeout(socket.callTimeouts[callId]);
      delete socket.callTimeouts[callId];
    }
  });

  // 8) End call (either side)
  socket.on("call:end", async ({ callId, conversationId = null, from, reason = 'ended', timestamp = new Date() }) => {
    await redisClient.del(`callRingTimeout:${callId}`);
    let callData: any = await redisClient.get(`audioVideoActiveCall:${callId}`) || "{}";
    console.info("end audio call: ", callId, callData);
    callData = JSON.parse(callData);
    let participants = callData.participants || []
    if (!participants.includes(from)) {
      return;
    }
    else {
      participants = participants.filter((u: any) => u != from);
    }
    for (let to of participants) {
      if (to == from) continue;

      const targetSocket = await redisClient.hGet("userSocketMap", to);
      if (!targetSocket) continue;

      let usrCall = await redisPublisher.get(`user:${to}:inCall:callId`);
      console.info("end call callId >>", callId, usrCall);
      if (participants.length <= 1 && usrCall == callId) {
        await redisPublisher.del(`user:${to}:inCall`);
        await redisPublisher.del(`user:${to}:inCall:callId`);
      }

      if (targetSocket) io.to(JSON.parse(targetSocket)).emit("call:ended", { callId, from, reason });

      // if (deviceType == "ios") {
      //   sendAudioVideoFCMNotification(to, {
      //     callId, fromm: from, to, isIncoming: false, messageType: 'audio'
      //   }, "individual");
      // }
    }
    socket.emit("call:ended", { from, reason: reason });

    const eventObj = {
      from,
      callId: callId,
      conversationId,
      status: reason || "ended",
      timestamp
    }
    const event = JSON.stringify(eventObj);
    await redisPublisher.publish("audioVideoCallUpdate", event);

    await redisPublisher.del(`user:${from}:inCall`);
    await redisPublisher.del(`user:${from}:inCall:callId`);

    let data = JSON.stringify({ participants, conversationId: callData.conversationId });
    await redisClient.set(`audioVideoActiveCall:${callId}`, data, { EX: 24 * 60 * 60 });

    // if (participants.includes(from)) {
    //   participants = participants.filter((u: any) => u != from);
    //   console.info("participants 1 to 1 audio :", participants);
    if (participants.length <= 1) {
      await redisClient.del(`audioVideoActiveCall:${callId}`);
    }
    // }
  });

  // 9) Busy / reject
  socket.on("call:reject", async ({ callId, from, to, reason = "rejected" }) => {
    let usrCall = await redisPublisher.get(`user:${to}:inCall:callId`);
    if (callId == usrCall) {
      await redisPublisher.del(`user:${to}:inCall`);
    }
    await redisPublisher.del(`user:${from}:inCall`);
    await redisClient.del(`callRingTimeout:${callId}`);
    await redisClient.del(`audioVideoActiveCall:${callId}`);
    console.info("call rejected by", from, callId);
    const targetSocket = await redisClient.hGet("userSocketMap", to);
    if (!targetSocket) return;
    if (targetSocket)
      io.to(JSON.parse(targetSocket)).emit("call:rejected", { callId, from, reason: reason || "rejected" });
    socket.emit("call:rejected", { from, reason: reason || "rejected" });
  });

  socket.on("call:add-user", async ({ callId, from, newUser }) => {
    let callData: any = await redisClient.get(`audioVideoActiveCall:${callId}`);
    callData = JSON.parse(callData || "{}");
    let participants = callData.participants || []
    if (!participants) return;
    const newUsers = Array.isArray(newUser) ? newUser : [newUser]
    for (let usr of newUsers) {
      // const newUserSocket = await redisClient.hGet("userSocketMap", usr);
      // io.to(JSON.parse(newUserSocket || "")).emit("call:add-incoming", { callId, newUser: usr, from, offerType: "addUser" })
      sendAudioVideoFCMNotification(usr, {
        callId, fromm: from, to: usr, offer: null, conversationId: callData.conversationId, isIncoming: true, messageType: 'audio', offerType: "addUser"
      }, "individual");
    }
  });

  socket.on("call:add-user-accept", async ({ callId, from, newUser }) => {
    let callData: any = await redisClient.get(`audioVideoActiveCall:${callId}`);
    callData = JSON.parse(callData || "{}");
    let participants = callData.participants || []
    if (!participants) return;
    await redisPublisher.set(`user:${from}:inCall`, '1');
    const callserder = await redisClient.hGet("userSocketMap", from);
    io.to(JSON.parse(callserder || "[]")).emit("call:add-incoming-accepted", { callId, from, newUser })

    if (!participants.includes(newUser)) {
      participants.push(newUser);
      await redisClient.set(`audioVideoActiveCall:${callId}`, JSON.stringify({ participants, conversationId: callData.conversationId }), { EX: 24 * 60 * 60 });
    }

    const newUserSocket = await redisClient.hGet("userSocketMap", newUser);

    // Notify existing users
    for (let u of participants) {
      if (u === newUser) continue;

      const sock = await redisClient.hGet("userSocketMap", u);
      if (!sock) continue;

      io.to(JSON.parse(sock)).emit("call:new-participant", {
        callId,
        userId: newUser,
        from
      });
    }

    // Tell new user about existing people
    if (newUserSocket) {
      io.to(JSON.parse(newUserSocket)).emit("call:existing-participants", {
        callId,
        participants: participants.filter((x: any) => x !== newUser),
        offerType: "addUser"
      });
    }
  })

  socket.on("call:add-offer", async ({ callId, from, to, offer }) => {
    const toSocket = await redisClient.hGet("userSocketMap", to);
    if (!toSocket) return
    io.to(JSON.parse(toSocket)).emit("call:add-offer", { callId, from, to, offer });
  });

  socket.on("call:add-answer", async ({ callId, from, to, answer }) => {
    const toSocket = await redisClient.hGet("userSocketMap", to);
    if (!toSocket) return
    io.to(JSON.parse(toSocket)).emit("call:add-answer", { callId, from, answer });
  });

};
