import { Socket, Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { redisClient } from "../../redis/redisClient";
import { sendAudioVideoFCMNotification } from "../../services/audioVideoFcm.service";
// import { getAuthByPhone } from "../../services/auth/authByPhone.service";
import { getUsersByPhones } from "../../services/auth/phone.service";
// import { getAuth } from "../../services/auth/auth.service";

interface SocketWithTimeouts extends Socket {
  callTimeouts?: { [callId: string]: NodeJS.Timeout };
}

const ttl = 60; // Default TTL of 60 seconds

export const taxiCallHandler = (socket: SocketWithTimeouts, io: Server, redisPublisher: any) => {
  socket.callTimeouts = {};

  // 1) Register is done in taxiChatHandler
  // 2) Caller sends an OFFER to a target mobile number
  socket.on("taxiCall:offer", async ({ from, to, offer, bookingId, role }) => {
    // const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    // const user = await getAuth(token);
    // let toUser = await getAuthByPhone(to);
    let userResponses = await getUsersByPhones([to], role == "individual" ? "taxi_driver" : "individual");
    let toUser = Array.isArray(userResponses) ? userResponses[0] : userResponses;
    socket.data.device_type = toUser?.device_type;
    // socket.data.role = toUser?.role;
    const userInCall = await redisPublisher.get(`user:${to}:inCall`);
    if (userInCall === '1') {
      socket.emit("taxiCall:InCall", { from, to, reason: "busy" });
      return;
    }
    console.info("taxiCall:offer", { from, to, offer, bookingId, toUser, userInCall, device_type: socket.data.device_type, role: role });
    const callId = uuidv4();
    // const targetSocket = taxiUserSocketMap.get(to);
    const targetSocket = await redisClient.hGet("taxiUserSocketMap", to);
    // if (!targetSocket) return

    if (toUser?.device_type == 'ios') {
      await sendAudioVideoFCMNotification(to, {
        callId, fromm: from, to, offer, bookingId, messageType: 'taxi_audio'
      // }, toUser.role);
      // }, socket.user.role == "individual" ? "taxi_driver" : "individual");
      }, role == "individual" ? "taxi_driver" : "individual");
    }
    else {
      let dat = await redisPublisher.get(`user:${to}:online`);
      if (dat == '0' || dat === null) {
        await sendAudioVideoFCMNotification(to, {
          callId, fromm: from, to, offer, bookingId, messageType: 'taxi_audio'
        // }, toUser.role);
        // }, socket.user.role == "individual" ? "taxi_driver" : "individual");
        }, role == "individual" ? "taxi_driver" : "individual");
      }
      else {
        io.to(JSON.parse(targetSocket || "[]")).emit("taxiCall:incoming", { callId, from, to, offer, bookingId });
      }
    }

    await redisPublisher.set(`user:${from}:inCall`, '1');
    await redisPublisher.set(`user:${to}:inCall`, '1');

    await redisClient.set(`taxiCallRingTimeout:${callId}`, JSON.stringify({ from, to }), {
      EX: Number(ttl) + 5,
    });

    const timeout = setTimeout(
      async () => {
        const callData = await redisClient.get(`taxiCallRingTimeout:${callId}`);
        if (!callData) {
          await redisPublisher.del(`user:${to}:inCall`);
          await redisPublisher.del(`user:${from}:inCall`);
          clearTimeout(timeout);
          return;
        }

        socket.emit("taxiCall:released", { callId, from, reason: "no-answer" });
        io.to(JSON.parse(targetSocket || "[]")).emit("taxiCall:released", { from, reason: "no-answer" });

        delete socket.callTimeouts?.[callId];
        await redisClient.del(`taxiCallRingTimeout:${callId}`);

        await redisPublisher.del(`user:${to}:inCall`);
        await redisPublisher.del(`user:${from}:inCall`);

        clearTimeout(timeout);
      },
      Number(ttl) * 1000,
    );

    if (!socket.callTimeouts) socket.callTimeouts = {};
    socket.callTimeouts[callId] = timeout;
  });

  // 3) ICE candidates exchange
  socket.on("taxiCall:ice-candidate", async ({ callId = null, from, to, candidate }) => {
    console.info("taxiCall:ice-candidate", { callId, from, to, candidate });
    const targetSocket = await redisClient.hGet("taxiUserSocketMap", to);
    if (!targetSocket) return;
    io.to(JSON.parse(targetSocket)).emit("taxiCall:ice-candidate", { callId, from, candidate });
  });

  // 4) Callee answers with an ANSWER back to caller
  socket.on("taxiCall:answer", async ({ callId, from, to, answer }) => {
    console.info("taxiCall:answer", { callId, from, to, answer });
    const targetSocket = await redisClient.hGet("taxiUserSocketMap", to);
    if (!targetSocket) return;
    await redisClient.del(`taxiCallRingTimeout:${callId}`);
    if (socket.callTimeouts?.[callId]) {
      clearTimeout(socket.callTimeouts[callId]);
      delete socket.callTimeouts[callId];
    }
    io.to(JSON.parse(targetSocket)).emit("taxiCall:answer", { callId, from, answer });
  });

  // 6) Call connected Stop Timmer
  socket.on("taxiCall:connect", async ({ callId, to, from }) => {
    console.info("taxiCall:connect", { callId, to, from });
    const targetSocket = await redisClient.hGet("taxiUserSocketMap", to);
    if (!targetSocket) return;
    await redisPublisher.set(`user:${to}:inCall`, '1');
    await redisPublisher.set(`user:${from}:inCall`, '1');
    await redisClient.del(`taxiCallRingTimeout:${callId}`);
    if (socket.callTimeouts?.[callId]) {
      clearTimeout(socket.callTimeouts[callId]);
      delete socket.callTimeouts[callId];
    }
    io.to(JSON.parse(targetSocket)).emit("taxiCall:connected", { callId, from, to });
  });

  // 7) Stop Timmer call (either side)
  socket.on("taxiCall:stopTimer", async ({ callId }) => {
    console.info("taxiCall:stopTimer", { callId });
    await redisClient.del(`taxiCallRingTimeout:${callId}`);
    if (socket.callTimeouts?.[callId]) {
      clearTimeout(socket.callTimeouts[callId]);
      delete socket.callTimeouts[callId];
    }
  });

  // 8) End call (either side)
  socket.on("taxiCall:end", async ({ callId, from, to, reason = 'ended' }) => {
    console.info("taxiCall:end", { callId, from, to, reason });
    await redisPublisher.del(`user:${to}:inCall`);
    await redisPublisher.del(`user:${from}:inCall`);
    const targetSocket = await redisClient.hGet("taxiUserSocketMap", to);
    if (!targetSocket) return;
    if (targetSocket) io.to(JSON.parse(targetSocket)).emit("taxiCall:ended", { callId, from, reason });
    socket.emit("taxiCall:ended", { from, reason: reason || "ended" });
  });

  // 9) Busy / reject
  socket.on("taxiCall:reject", async ({ callId, from, to, reason }) => {
    console.info("taxiCall:reject", { callId, from, to, reason });
    await redisPublisher.del(`user:${to}:inCall`);
    await redisPublisher.del(`user:${from}:inCall`);
    const targetSocket = await redisClient.hGet("taxiUserSocketMap", to);
    if (!targetSocket) return;
    if (targetSocket) io.to(JSON.parse(targetSocket)).emit("taxiCall:rejected", { callId, from, reason: reason || "rejected" });
    socket.emit("taxiCall:rejected", { from, reason: reason || "rejected" });
  });

  // 10) is call started
  socket.on("taxiCall:is-call-started", async ({ callId, from, to, status = "ringing" }) => {
    console.info("taxiCall:is-call-started", { callId, from, to, status });
    const targetSocket = await redisClient.hGet("taxiUserSocketMap", to);
    if (!targetSocket) return;
    io.to(JSON.parse(targetSocket)).emit("taxiCall:is-call-started", { callId, from, status });
  });

  // 11) mute / unmute
  socket.on("taxiCall:mute-unmute", async ({ callId, from, to, status }) => {
    console.info("taxiCall:mute-unmute", { callId, from, to, status });
    const targetSocket = await redisClient.hGet("taxiUserSocketMap", to);
    if (!targetSocket) return;
    io.to(JSON.parse(targetSocket)).emit("taxiCall:mute-unmute", { callId, from, status });
  });
};
