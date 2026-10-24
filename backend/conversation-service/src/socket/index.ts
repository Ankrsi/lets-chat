import { Server } from "socket.io";
import { createServer } from "http";
import { redisSubscriber, redisPublisher, redisClient } from "../redis/redisClient";
import { kafka } from "../kafka/kafkaClient";
// import pm2 from "pm2";
import { updateWorkers, updateMetricsForCall, updateGlobalMetrics, removeMetricsForCall } from "./mediasoupMetrics";
declare module "socket.io" {
  interface Socket {
    user?: any;
  }
}
import { chatHandler } from "./handlers/chatHandler";
import { videoHandler } from "./handlers/videoHandler";
import { callHandler } from "./handlers/callHandler";
import { supportSocket } from "./handlers/supportHandler";
// import { locationHandler } from "./handlers/locationHandler"; // ✅ Driver location handler
import { driverLocationHandler } from "./handlers/taxihandlers/driverlocationHandler";
import { driverGeoKafkaHandler } from "./handlers/taxihandlers/driverGeoKafkaHandler";
import { transactionHandler, transactionUserMap } from "./handlers/transactionHandler";
import { rideCancellationHandler } from "./handlers/taxihandlers/rideCancellationHandler"; // NEW: Import rideCancellationHandler
import { passengerCancellationHandler } from "./handlers/taxihandlers/passengerCancellationHandler";
import { rideStatusHandler } from "./handlers/taxihandlers/rideStatusHandler";
import { liveFareHandler } from "./handlers/taxihandlers/liveFareHandler";
import { Express } from "express-serve-static-core";
import { getAuth } from "../services/auth/auth.service";
import { eventHandler } from "./handlers/eventHandler";
import { createAdapter } from "@socket.io/redis-adapter";
import mongoose from "mongoose";
import { getConversationMembers } from "../controllers/chats/chats.controller";
import { taxiChatHandler } from "./handlers/taxiChatHandler";
import { taxiCallHandler } from "./handlers/taxiCallHandler";
import { poolRideCoordinateHandler } from "./handlers/taxihandlers/pool/poolRideCoordinateHandler";
import { groupCallHandler } from "./handlers/groupCallHandler";
import { createWorker } from "mediasoup";
import { resolveAnnouncedIp } from "../utils/publicIp";
import { poolAcceptHandler } from "./handlers/taxihandlers/pool/poolAcceptHandler";
import { rideRequestHandler } from "./handlers/taxihandlers/rideRequestHandler";
import AllFriendsContact from "../models/contactModal/allFriendsContact.model";
import jwt from "jsonwebtoken";
import { groupVideoCallHandler } from "./handlers/groupVideoCallHandler";
import { botChatHandler } from "./handlers/botChatHandler";
import { orderLocationHandler } from "./handlers/ecommerce/orderLocationHandler";
import { orderStatusHandler } from "./handlers/ecommerce/orderStatusHandler";
import { deliveryLocationHandler } from "./handlers/ecommerce/deliveryLocationHandler";
import { claimOnce } from "../utils/claimOnce";

// .
// .
// .
// End of Import

// export const userSocketMap = new Map<string, string>();
export const userActiveChats = new Map<string, string>();

// export const INSTANCE_ID = process.env.NODE_APP_INSTANCE ?? "0";
// export let LAST_INSTANCE_ID = process.env.NODE_APP_INSTANCE ?? "0";

export let worker: any;
export const routers = new Map();
export const userTransports = new Map();
export const transportsById = new Map();
export const producers = new Map();
export const consumers = new Map();

export const startSocketServer = async (app: Express) => {
  // pm2.list((err, list) => {
  //   const instances = list.filter((p: any) => p.name === "conversation-service") || [];
  //   console.log("PM2 instances:", instances);
  //   if (instances.length > 0) {
  //     LAST_INSTANCE_ID = instances[instances.length - 1]?.pm_id?.toString() || "0";
  //   }
  //   if (err) {
  //     console.error("PM2 list error:", err);
  //   }
  //   console.log("INSTANCE_ID:", INSTANCE_ID, "LAST_INSTANCE_ID:", LAST_INSTANCE_ID);
  // });

  const httpServer = createServer();
  // const io = new Server(httpServer, { cors: { origin: "*" } });
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    connectionStateRecovery: {},
    adapter: createAdapter(redisPublisher, redisSubscriber),
    transports: ['websocket', 'polling'],
    // pingTimeout: 60000,
    pingTimeout: 5000,
    // pingInterval: 25000
    pingInterval: 5000
  });

  // .
  // .
  // .
  // End of Initialization of Socket Server

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("Authentication required"));
    try {
      const response = jwt.verify(token, process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n'), {
        algorithms: ["RS256"],
        issuer: "auth.superapp"
      });
      socket.user = response;
      next();
    } catch (err: any) {
      console.error(
        "Failed to fetch user details",
        err?.response?.data || err.message
      );
      // throw new ApiError("Failed to authenticate user", 401);
    }
  });

  // .
  // .
  // .
  // End of User Authentication using JWT for Socket connection

  const producer = kafka.producer();
  await producer.connect();
  // .
  // .
  // .
  // End of Connecting with Kafka

  //// make warker for group call ///
  async function runMediasoupWorker() {
    await resolveAnnouncedIp();
    worker = await createWorker({
      rtcMinPort: 10000,
      rtcMaxPort: 20000,
      logLevel: "warn",
      logTags: ["info", "ice", "dtls"],
    });

    worker.on("died", () => {
      console.error("mediasoup worker died, exiting");
      // process.exit(1);
    });
  }
  runMediasoupWorker();

  // Update mediasoup metrics every 5 seconds
  setInterval(async () => {
    // Update workers global
    updateWorkers(worker ? 1 : 0);

    // Global totals
    let globalIncoming = 0;
    let globalOutgoing = 0;
    let globalTotalPacketLoss = 0;
    let globalTotalJitter = 0;
    let globalConsumerCount = 0;
    let globalTransportsCount = 0;
    let globalProducersCount = 0;
    let globalConsumersCount = 0;

    // Per call metrics
    for (const [conversationId] of routers) {
      let incoming = 0;
      let outgoing = 0;
      let totalPacketLoss = 0;
      let totalJitter = 0;
      let consumerCount = 0;
      let mediasoupJitter = 0;
      let mediasoupPacketLoss = 0;
      let transportsCount = 0;
      let producersCount = 0;
      let consumersCount = 0;

      // Collect transports for this conversationId
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [_, entry] of transportsById) {
        if (entry.conversationId === conversationId) {
          const transport = entry.transport;
          if (!transport || transport.closed) continue;
          transportsCount++;
          try {
            const stats = await entry.transport.getStats();
            stats.forEach((s: any) => {
              incoming += s.bytesReceived || 0;
              outgoing += s.bytesSent || 0;
            });
          } catch (err: any) {
            console.info("error", err);
          }
        }
      }

      // Producers count
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [_, entry] of producers) {
        if (entry.conversationId === conversationId) {
          producersCount++;
        }
      }

      // Consumers
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [_, entry] of consumers) {
        if (entry.conversationId === conversationId) {
          consumersCount++;
          try {
            const stats = await entry.consumer.getStats();
            stats.forEach((s: any) => {
              if (s.type === "inbound-rtp") {
                const received = s.packetsReceived || 0;
                const lost = s.packetsLost || 0;
                if (received + lost > 0) {
                  totalPacketLoss += lost / (received + lost);
                }
                totalJitter += s.jitter || 0;
                consumerCount++;
              }
            });
          } catch (err: any) {
            console.info("error", err);
          }
        }
      }

      if (consumerCount > 0) {
        mediasoupPacketLoss = totalPacketLoss / consumerCount;
        mediasoupJitter = totalJitter / consumerCount;
      }

      updateMetricsForCall(
        conversationId,
        incoming,
        outgoing,
        transportsCount,
        producersCount,
        consumersCount,
        mediasoupPacketLoss,
        mediasoupJitter,
      );

      // Accumulate global
      globalIncoming += incoming;
      globalOutgoing += outgoing;
      globalTotalPacketLoss += totalPacketLoss;
      globalTotalJitter += totalJitter;
      globalConsumerCount += consumerCount;
      globalTransportsCount += transportsCount;
      globalProducersCount += producersCount;
      globalConsumersCount += consumersCount;
    }

    // Update global metrics
    let globalPacketLoss = 0;
    let globalJitter = 0;
    if (globalConsumerCount > 0) {
      globalPacketLoss = globalTotalPacketLoss / globalConsumerCount;
      globalJitter = globalTotalJitter / globalConsumerCount;
    }
    updateGlobalMetrics(
      globalIncoming,
      globalOutgoing,
      globalTransportsCount,
      globalProducersCount,
      globalConsumersCount,
      globalPacketLoss,
      globalJitter,
    );
  }, 5000);

  ///////////////////////////////////

  // set io, producer, mediasoupMetrics in app
  app.set("io", io);
  app.set("producer", producer);

  io.on("connection", (socket) => {
    console.info("Client connected:", socket.id);

    // reset connect on realod page/server
    (async () => {
      if (socket.id) {
        const senderId = await redisPublisher.hGet("socketUserMap", socket.id)
        if (senderId) {
          // userSocketMap.delete(senderId);
          // userSocketMap.set(senderId, socket.id);

          // redisPublisher.hSet("userSocketMap", senderId, socket.id).catch(console.error);
          // redisPublisher.hSet("socketUserMap", socket.id, senderId).catch(console.error);
          const existingSockets = await redisPublisher.hGet("userSocketMap", senderId.toString());
          let socketArray: string[] = existingSockets ? JSON.parse(existingSockets) : [];
          if (!socketArray.includes(socket.id)) socketArray.push(socket.id);
          await redisPublisher.hSet("userSocketMap", senderId, JSON.stringify(socketArray));
          await redisPublisher.hSet("socketUserMap", socket.id, senderId.toString());
          await redisPublisher.set(`user:${senderId}:online`, "1");
          io.emit("chat:updateStatusList");
          // socket.broadcast.emit("chat:updateStatusList");
        }
        else {
          const token = socket.handshake.auth?.token || socket.handshake.query?.token;
          if (token) {
            const payload = await getAuth(token);
            // const userData = await getUserById({user_id: payload._id.toString()})
            if (payload?.phone) {
              // userSocketMap.set(payload.phone, socket.id);
              console.info(`phone | ${payload?.phone}`)
              console.info('maped |', socket.id)
              // redisPublisher.hSet("userSocketMap", payload.phone, socket.id).catch(console.error);
              // redisPublisher.hSet("socketUserMap", socket.id, payload.phone).catch(console.error);
              const existingSockets = await redisPublisher.hGet("userSocketMap", payload?.phone.toString());
              let socketArray: string[] = existingSockets ? JSON.parse(existingSockets) : [];
              if (!socketArray.includes(socket.id)) socketArray.push(socket.id);
              await redisPublisher.hSet("userSocketMap", payload?.phone.toString(), JSON.stringify(socketArray));
              await redisPublisher.hSet("socketUserMap", socket.id, payload.phone.toString());
              await redisPublisher.set(`user:${payload?.phone.toString()}:online`, "1");
              if (payload?.role == 'taxi_driver') {
                await redisPublisher.hSet('userSocketMap:role:taxi', payload?.phone.toString(), JSON.stringify(socketArray));
              }
              io.emit("chat:updateStatusList");
            }
          }
        }
      }
    })()


    // .
    // .
    // .
    // .

    // chatHandler(socket, producer);
    chatHandler(socket, io, redisPublisher, producer);
    callHandler(socket, io, redisPublisher);
    groupCallHandler(socket, redisPublisher);
    groupVideoCallHandler(socket, redisPublisher);
    videoHandler(socket, io, redisPublisher);
    taxiChatHandler(socket, producer, io, redisPublisher);
    botChatHandler(socket, producer, redisPublisher);
    taxiCallHandler(socket, io, redisPublisher);
    supportSocket(socket, io);

    // .
    // .
    // .
    // End of Calling Chathandler Function


    /* ==========================================================
     TAXI / RIDE SOCKET HANDLERS
    ========================================================== */
    // Handles real-time driver GPS updates (lat/lng) via socket
    driverLocationHandler(socket, producer);
    // Publishes driver geo-coordinates to Kafka for nearby-driver matching
    driverGeoKafkaHandler(socket, producer);
    // Handles passenger-initiated ride cancellation events
    passengerCancellationHandler(socket, io);
    // Handles driver-initiated ride cancellation events
    rideCancellationHandler(socket, io);
    // Handles ride status transitions (accepted, arrived, started, completed)
    rideStatusHandler(socket, producer);
    // Sends real-time fare recalculations during an ongoing ride
    liveFareHandler(socket, producer);
    // Handles live coordinate updates for pool rides
    poolRideCoordinateHandler(socket, producer);
    // Handles pool ride accept / reject flow by drivers
    poolAcceptHandler(socket, producer);
    // Lets drivers subscribe/ack the new `ride:new-request` events (nearby-driver dispatch)
    rideRequestHandler(socket);

    // Handles real-time order location updates for e-commerce deliveries
    orderLocationHandler(socket, producer);
    // Handles real-time delivery partner location updates for e-commerce deliveries
    deliveryLocationHandler(socket, producer);
    // Handles real-time order status updates for e-commerce orders
    orderStatusHandler(socket, producer);

    /* ==========================================================
           TAXI / RIDE SOCKET HANDLERS END
    ========================================================== */

    /* ==========================================================
       RIDE SUBSCRIPTIONS
    ========================================================== */

    // Subscribe to ride updates
    socket.on("subscribe", async ({ rideId }) => {
      console.info(`Passenger subscribed to task ${rideId}`);
      socket.join(rideId);

      // Send the latest ride status, if available
      const lastStatus = await redisClient.get(`ride:last-status:${rideId}`);
      if (lastStatus) socket.emit("rideStatusUpdate", JSON.parse(lastStatus));

      // Send the latest driver location, if available
      const lastLocation = await redisClient.get(`ride:last-location:${rideId}`);
      if (lastLocation) socket.emit("locationUpdateFromDriver", JSON.parse(lastLocation));

      // Send the latest fare information, if available 
      const lastFare = await redisClient.get(`ride:last-fare:${rideId}`);
      if (lastFare) socket.emit("liveFareUpdate", JSON.parse(lastFare));

    });

    // Unsubscribe from ride updates
    socket.on("unsubscribeRide", ({ rideId }) => {
      // console.info(`Passenger unsubscribed from ride ${rideId}`);
      socket.leave(rideId);
      // Optional: Emit a confirmation back to the passenger
      socket.emit("unsubscribedRide", { rideId, message: "Successfully unsubscribed from ride updates." });
    })

    // Subscribe to ride updates using a share token
    socket.on("subscribeShare", async ({ token }) => {
      try {
        if (!token) return socket.emit("share:error", { message: "Token required" });
        const key = `share:${token}`;
        const raw = await redisClient.get(key);
        if (!raw) {
          return socket.emit("share:error", { message: "Invalid or expired token" });
        }
        const payload = JSON.parse(raw);
        const rideId = String(payload.rideId);
        const jwtToken = payload.jwtToken;
        socket.data.jwtToken = jwtToken;
        socket.join(rideId);
        socket.emit("share:subscribed", { rideId });
      } catch (err) {
        console.error("subscribeShare error", err);
        socket.emit("share:error", { message: "Subscription failed" });
      }
    });

    /* ==========================================================
       POOL RIDE SUBSCRIPTIONS
    ========================================================== */

    // Subscribe to pool ride request updates
    socket.on("joinPoolRequest", async ({ requestId }) => {
      if (!requestId) return;
      socket.join(requestId);
      // console.info(`👤 Passenger joined request room: ${requestId}`);
      // Send the latest pool ride status, if available
      const last = await redisClient.get(`pool:last-accept:${requestId}`);
      if (last) socket.emit("poolRideUpdate", JSON.parse(last));
    });

    // Unsubscribe from pool ride request updates
    socket.on("leavePoolRequest", ({ requestId }) => {
      if (!requestId) return;

      if (socket.rooms.has(requestId)) {
        socket.leave(requestId);
        // console.info(`👤 Passenger left request room: ${requestId}`);
      }

      socket.emit("poolRideUnsubscribed", {
        requestId,
        message: "Successfully unsubscribed from pool ride updates."
      });
    });


    /* ==========================================================
      ORDER TRACKING SUBSCRIPTIONS
   ========================================================== */

    // Subscribe to order tracking updates
    socket.on("subscribeOrderTracking", async ({ orderId }) => {
      socket.join(orderId);

      // Confirmation
      socket.emit("subscribedOrderTracking", {
        orderId,
        message: "Successfully subscribed to order tracking.",
      });

      // Send the latest order location, if available
      const lastLocation = await redisClient.get(
        `order:last-location:${orderId}`
      );

      if (lastLocation) {
        socket.emit(
          "orderTrackingUpdate",
          JSON.parse(lastLocation)
        );
      }

      // Send the latest order status, if available
      const lastStatus = await redisClient.get(
        `order:last-status:${orderId}`
      );

      if (lastStatus) {
        socket.emit(
          "orderStatusUpdate",
          JSON.parse(lastStatus)
        );
      }
    });

    // Unsubscribe from order tracking updates
    socket.on("unsubscribeOrderTracking", ({ orderId }) => {
      socket.leave(orderId);

      socket.emit("unsubscribedOrderTracking", {
        orderId,
        message: "Successfully unsubscribed from order tracking.",
      });
    });


    // Subscribe to delivery partner tracking updates
    socket.on("subscribeDeliveryTracking", async ({ deliveryId }) => {
      socket.join(deliveryId);

      socket.emit("subscribedDeliveryTracking", {
        deliveryId,
        message: "Successfully subscribed to delivery tracking.",
      });

      const lastLocation = await redisClient.get(
        `delivery:last-location:${deliveryId}`
      );

      if (lastLocation) {
        socket.emit(
          "deliveryTrackingUpdate",
          JSON.parse(lastLocation)
        );
      }
    });

    //  unsubscripbe Delivery Tracking.
    socket.on("unsubscribeDeliveryTracking", ({ deliveryId }) => {
      socket.leave(deliveryId);

      socket.emit("unsubscribedDeliveryTracking", {
        deliveryId,
        message: "Successfully unsubscribed from delivery tracking.",
      });
    });

    ////////////////////////////// order tracking subscription end ////////////////////////////


    transactionHandler(io, socket);

    // .
    // .
    // .
    // End of Calling TransactionHanlder Function

    eventHandler(io, socket, producer, redisPublisher);

    // .
    // .
    // .
    // End of Calling Wallet Event Handler Function

    socket.on("disconnect", async () => {
      // const disconnectedEntry = [...userSocketMap.entries()].find(
      //   ([, socketId]) => socketId === socket.id,
      // );
      removeFromGroupCall(socket);
      const disconnectedEntry = await redisClient.hGet("socketUserMap", socket.id);
      if (disconnectedEntry) {
        const userId = disconnectedEntry;
        // userSocketMap.delete(userId);
        // await redisPublisher.hDel("userSocketMap", userId);
        const existingSocketsStr = await redisClient.hGet("userSocketMap", userId);
        let socketArray: string[] = [];
        if (existingSocketsStr) {
          try {
            socketArray = JSON.parse(existingSocketsStr);
          } catch {
            socketArray = [];
          }
        }
        socketArray = socketArray.filter(id => id !== socket.id);
        if (socketArray.length > 0) {
          await redisPublisher.hSet("userSocketMap", userId, JSON.stringify(socketArray));
        } else {
          await redisPublisher.hDel("userSocketMap", userId);
        }
        userActiveChats.delete(userId);
        await redisPublisher.del(`user:${userId}:inCall`);
        await redisPublisher.set(`user:${userId}:online`, "0");
        await redisPublisher.hDel("socketUserMap", socket.id);
        let convId = await redisClient.get(`currentChatRoom:${userId}`);
        if (convId) {
          // io.to(convId).emit("chat:updateStatusList");
          await redisClient.set(`lastChatRoom:${socket.id}`, "");
          await redisClient.del(`currentChatRoom:${userId}`);
        }
        io.emit("chat:updateStatusList");
        console.info("Client disconnected:", socket.id);
      }
      const disconnectedEntryTaxi = await redisClient.hGet("taxiSocketUserMap", socket.id);
      if (disconnectedEntryTaxi) {
        const username = disconnectedEntryTaxi;
        await redisPublisher.del(`taxiUser:${username}:online`);
      }
    });
  });

  // .
  // .
  // .
  // End of Disconnection of Socket

  // clear user from group call /////////////
  const removeFromGroupCall = async (socket: any) => {
    const conversationId = socket.data.conversationId;
    const ut = userTransports.get(socket.id);
    if (ut) {
      for (const key of ["sendTransport", "recvTransport"]) {
        const t: any = ut[key as any];
        if (t) {
          try {
            t?.close();
          } catch (e) {
            console.error("error: ", e)
          }
          transportsById.delete(t.id);
        }
      }
      userTransports.delete(socket.id);
    }

    // remove producers created by this socket
    for (const [pid, entry] of producers) {
      if (entry.socketId === socket.id) {
        try { entry.producer.close(); } catch (e) {
          console.error("error: ", e);
        }
        producers.delete(pid);
        socket.to(entry.conversationId).emit("producerClosed", { producerId: pid });
      }
    }

    // close consumers created for this socket
    for (const [cid, entry] of consumers) {
      if (entry.socketId === socket.id) {
        try { entry.consumer.close(); } catch (e) {
          console.error("error: ", e);
        }
        consumers.delete(cid);
      }
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
        console.info(`Room ${conversationId} auto-cleaned on disconnect`);
      }
    }
  }
  ////////////////

  // if (INSTANCE_ID == LAST_INSTANCE_ID) {
  await redisSubscriber.subscribe("chat", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("chat", msg, data.messageId))) return;
      const members = data.otherMember || [];
      delete data.otherMember;
      for (let member of members) {
        if (member == data.senderId) continue;
        const userSocketMap = JSON.parse(await redisClient.hGet("userSocketMap", member.toString()) || "[]");
        // const isOnline = await redisClient.get(`user:${member}:online`);
        // io.to(data.conversationId.toString()).emit("chat:recv-message", data);
        if (userSocketMap.length) io.to(userSocketMap).emit("chat:recv-message", data);
        producer.send({
          topic: "offline-chat-messages",
          messages: [{ value: JSON.stringify({ ...data, member }) }],
        });
      }
    } catch (e) {
      console.error("invalid redis chat message", e);
    }
  });
  // }

  // if (INSTANCE_ID == LAST_INSTANCE_ID) {
  await redisSubscriber.subscribe("chat-messages-status", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("chat-messages-status", msg, `${data.messageId}:${data.updatedStatus}`))) return;
      let convMember = await getConversationMembers(data.conversationId);
      for (let member of convMember) {
        if (member == data.username) continue;
        const isOnline = await redisClient.get(`user:${member}:online`);
        if (isOnline == "1") {
          const userSocketMap = JSON.parse(await redisClient.hGet("userSocketMap", member.toString()) || "[]");
          if (userSocketMap.length) io.to(userSocketMap).emit("chat:messageStatusUpdate", data);
        }
        else {
          producer.send({
            topic: "offline-chat-messages-status",
            messages: [{ value: JSON.stringify({ ...data, member }) }],
          });
        }
      }
    } catch (e) {
      console.error("invalid redis chat message status", e);
    }
  });
  // }

  // if (INSTANCE_ID == LAST_INSTANCE_ID) {
  await redisSubscriber.subscribe("chat-delete-messages", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("chat-delete-messages", msg, null, 30))) return;
      let convMember = await getConversationMembers(data.conversationId);
      for (let member of convMember) {
        if (member == data.username) continue;
        const isOnline = await redisClient.get(`user:${member}:online`);
        if (isOnline == "1") {
          const userSocketMap = JSON.parse(await redisClient.hGet("userSocketMap", member.toString()) || "[]");
          if (userSocketMap.length) io.to(userSocketMap).emit("chat:deleteMessages", data);
        }
        else {
          producer.send({
            topic: "offline-delete-messages",
            messages: [{ value: JSON.stringify({ ...data, member }) }],
          });
        }
      }
    } catch (e) {
      console.error("invalid redis delete messages", e);
    }
  });
  // }

  // if (INSTANCE_ID == LAST_INSTANCE_ID) {
  await redisSubscriber.subscribe("chat-edit-message", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("chat-edit-message", msg, null, 30))) return;
      let convMember = await getConversationMembers(data.conversationId);
      for (let member of convMember) {
        if (member == data.username) continue;
        const isOnline = await redisClient.get(`user:${member}:online`);
        if (isOnline == "1") {
          const userSocketMap = JSON.parse(await redisClient.hGet("userSocketMap", member.toString()) || "[]");
          if (userSocketMap.length) io.to(userSocketMap).emit("chat:editMessage", data);
        }
        else {
          producer.send({
            topic: "offline-edit-message",
            messages: [{ value: JSON.stringify({ ...data, member }) }],
          });
        }
      }
    } catch (e) {
      console.error("invalid redis delete messages", e);
    }
  });
  // }

  // if (INSTANCE_ID == LAST_INSTANCE_ID) {
  await redisSubscriber.subscribe("update-disappearing-messages", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("update-disappearing-messages", msg, null, 30))) return;
      const tempUsername = data.username;
      let convMember = await getConversationMembers(data.conversationId);
      for (let member of convMember) {
        if (String(member) == String(tempUsername)) continue;
        const isOnline = await redisClient.get(`user:${member}:online`);
        if (isOnline == "1") {
          const userSocketMap = JSON.parse(await redisClient.hGet("userSocketMap", member.toString()) || "[]");
          if (userSocketMap.length) io.to(userSocketMap).emit("chat:updateDisappearingMessages", data);
        }
        else {
          producer.send({
            topic: "offline-update-disappearing-messages",
            messages: [{ value: JSON.stringify({ ...data, member }) }],
          });
        }
      }
    } catch (e) {
      console.error("invalid redis update disappearing messages", e);
    }
  });
  // }

  // if (INSTANCE_ID == LAST_INSTANCE_ID) {
  await redisSubscriber.subscribe("audioVideoCallUpdate", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("audioVideoCallUpdate", msg, null, 30))) return;
      const from = data.from;
      delete data.from;
      let callData = await redisClient.get(`audioVideoActiveCall:${data.callId}`);
      // const convId = JSON.parse(callData || "{}").conversationId;
      // let convMember = await getConversationMembers(convId);
      let convMember = JSON.parse(callData || "{}").participants || [data?.to] || [];
      for (let member of convMember) {
        if (member == from && data.status == "missed") continue;
        console.info(`Audio/Video call update for ${data.callId} -> ${member}: ${data.status}`);
        const isOnline = await redisClient.get(`user:${member}:online`);
        if (isOnline == "1") {
          const userSocketMap = JSON.parse(await redisClient.hGet("userSocketMap", member.toString()) || "[]");
          if (userSocketMap.length) io.to(userSocketMap).emit("call:audioVideoStatusUpdate", data);
        }
        else {
          producer.send({
            topic: "offline-audio-video-call-status",
            messages: [{ value: JSON.stringify({ ...data, member }) }],
          });
        }
      }
      if (data.status == "ended") {
        let redisData = JSON.parse(await redisClient.get(`audioVideoActiveCall:${data.callId}`) || "{}");
        if (redisData?.participants && redisData?.participants.length <= 1) {
          console.info("end current call:", redisData);
          await redisClient.del(`audioVideoActiveCall:${data.callId}`);
        }
      }
    } catch (e) {
      console.error("invalid redis chat calls status", e);
    }
  });
  // }

  // if (INSTANCE_ID == LAST_INSTANCE_ID) {
  await redisSubscriber.subscribe("taxiChat", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("taxiChat", msg, data.messageId))) return;
      io.to(data.bookingId.toString()).emit("taxi:recv-message", data);
      producer.send({
        topic: "offline-taxi-chat-messages",
        messages: [{ value: JSON.stringify(msg) }],
      });
    } catch (e) {
      console.error("invalid redis chat message", e);
    }
  });
  // }

  await redisSubscriber.subscribe("typing", (msg) => {
    try {
      const data = JSON.parse(msg);
      io.to(data.conversationId.toString()).emit("chat:typing", data);
    } catch (e) {
      console.error("invalid redis typing message", e);
    }
  });

  await redisSubscriber.subscribe("chatStatusRefresh", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("chatStatusRefresh", msg, null, 2))) return;
      let friendsData = await AllFriendsContact.findOne({
        phone: data.phone.toString()
      });
      if (!friendsData) {
        return;
      }
      const socketIds = await Promise.all(
        friendsData.contacts.map(async (c: any) =>
          await redisClient.hGet("userSocketMap", c.phone.toString())
        )
      );
      if (socketIds.length > 0) {
        for (let sock of socketIds) {
          let socket = JSON.parse(sock || "[]");
          if (socket.length) io.to(socket).emit("chat:chatStatusRefresh");
        }
      }
    } catch (e) {
      console.error("invalid redis message", e);
    }
  });

  // if (INSTANCE_ID == LAST_INSTANCE_ID) {
  await redisSubscriber.subscribe("group-key-chat", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("group-key-chat", msg, null, 30))) return;
      const member = data.to || "";
      const userSocketMap = JSON.parse(await redisClient.hGet("userSocketMap", member.toString()) || "[]");
      // const isOnline = await redisClient.get(`user:${member}:online`);
      if (userSocketMap.length) io.to(userSocketMap).emit("chat:send-group-key", data);
      console.info(`send group key to ${member.toString()}`);
      producer.send({
        topic: "offline-group-key-chat",
        messages: [{ value: JSON.stringify({ ...data, member }) }],
      });
    } catch (e) {
      console.error("invalid redis chat message", e);
    }
  });
  // }

  // if (INSTANCE_ID == LAST_INSTANCE_ID) {
  await redisSubscriber.subscribe("chat-resend-request", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("chat-resend-request", msg, null, 30))) return;
      const member = data.to || "";
      const userSocketMap = JSON.parse(await redisClient.hGet("userSocketMap", member.toString()) || "[]");
      if (userSocketMap.length) io.to(userSocketMap).emit("chat:resend-request", data);
      producer.send({
        topic: "offline-resend-request",
        messages: [{ value: JSON.stringify({ ...data, member }) }],
      });
    } catch (e) {
      console.error("invalid redis resend request", e);
    }
  });
  // }

  // if (INSTANCE_ID == LAST_INSTANCE_ID) {
  await redisSubscriber.subscribe("msgOneview", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("msgOneview", msg, null, 30))) return;
      let convMember = await getConversationMembers(data.conversationId);
      for (let member of convMember) {
        if (member == data.username) continue;
        const isOnline = await redisClient.get(`user:${member}:online`);
        if (isOnline == "1") {
          const userSocketMap = JSON.parse(await redisClient.hGet("userSocketMap", member.toString()) || "[]");
          if (userSocketMap.length) io.to(userSocketMap).emit("chat:one-view", data);
        }
        else {
          producer.send({
            topic: "offline-one-view",
            messages: [{ value: JSON.stringify({ ...data, member }) }],
          });
        }
      }
    } catch (e) {
      console.error("invalid redis delete messages", e);
    }
  });
  // }

  await redisSubscriber.subscribe("msgReaction", async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!(await claimOnce("msgReaction", msg, null, 30))) return;
      let convMember = await getConversationMembers(data.conversationId);
      for (let member of convMember) {
        if (member == data.from) continue;
        const isOnline = await redisClient.get(`user:${member}:online`);
        let activeRoom = await redisPublisher.get(`lastChatRoom:${member}`);
        if (isOnline != "1" || data.conversationId != activeRoom) {
          producer.send({
            topic: "offline-chat-msg-reaction",
            messages: [{ value: JSON.stringify({ ...data, member }) }],
          });
        }
        else {
          const userSocketMap = JSON.parse(await redisClient.hGet("userSocketMap", member.toString()) || "[]");
          if (userSocketMap.length) io.to(userSocketMap).emit("chat:msgReaction", data);
        }
      }
    } catch (e) {
      console.error("invalid redis msgReaction message", e);
    }
  });

  await redisSubscriber.pSubscribe("__keyevent@0__:expired", async (key) => {
    if (/^chatMsg:([a-zA-Z0-9-]+):disappearingMessages$/.test(key)) {
      const conversationId = key.match(/^chatMsg:([a-zA-Z0-9-]+):disappearingMessages$/)![1];
      if (conversationId) {
        let value = await redisClient.get(`chatMsg:${conversationId}:disappearingMessages:ttl`);
        let convMember = await getConversationMembers(conversationId);
        for (let member of convMember) {
          const isOnline = await redisClient.get(`user:${member}:online`);
          if (isOnline == "1") {
            const userSocketMap = JSON.parse(await redisClient.hGet("userSocketMap", member.toString()) || "[]");
            if (userSocketMap.length) io.to(userSocketMap).emit("chat:disappearingMessages", { conversationId });
          }
          else {
            producer.send({
              topic: "offline-disappearing-messages",
              messages: [{ value: JSON.stringify({ conversationId, member }) }],
            });
          }
        }
        if (value) {
          await redisPublisher.set(`chatMsg:${conversationId}:disappearingMessages`, value ?? "");
          await redisPublisher.expire(`chatMsg:${conversationId}:disappearingMessages`, Number(value));
        }
      }
    }
    if (/^chatMsg:([a-zA-Z0-9-]+):destructingMessages$/.test(key)) {
      const conversationId = key.match(/^chatMsg:([a-zA-Z0-9-]+):destructingMessages$/)![1];
      if (conversationId) {
        let value = JSON.parse(await redisClient.get(`chatMsg:${conversationId}:destructingMessages:data`) || "{}");
        let convMember = await getConversationMembers(conversationId);
        for (let member of convMember) {
          const isOnline = await redisClient.get(`user:${member}:online`);
          if (isOnline == "1") {
            const userSocketMap = JSON.parse(await redisClient.hGet("userSocketMap", member.toString()) || "[]");
            if (userSocketMap.length) io.to(userSocketMap).emit("chat:destructingMessages", { conversationId, "senderId": value.senderId, "timestamp": value.timestamp });
          }
          else {
            producer.send({
              topic: "offline-destructing-messages",
              messages: [{ value: JSON.stringify({ conversationId, "senderId": value.senderId, "timestamp": value.timestamp, member }) }],
            });
          }
        }
        if (value) {
          await redisPublisher.set(`chatMsg:${conversationId}:disappearingMessages`, Number(value.ttl));
          await redisPublisher.expire(`chatMsg:${conversationId}:disappearingMessages`, Number(value.ttl));
          await redisPublisher.set(`chatMsg:${conversationId}:destructingMessages:data`, JSON.stringify(value));
        }
      }
    }
  });

  // .
  // .
  // End of Subscribe of User Messages in Redis Pub Sub

  redisSubscriber.pSubscribe("messageStatus:*", async (message, channel) => {
    const userId = channel.split(":")[1];
    const messageDetails = JSON.parse(message);
    if (!(await claimOnce(channel, message, null, 30))) return;
    const socketId = await redisClient.hGet("userSocketMap", userId);
    const activeChatId = userActiveChats.get(userId);
    if (!socketId) return;
    if (activeChatId == messageDetails.chatId) {
      io.to(JSON.parse(socketId)).emit("messageRead", messageDetails);
    }
  });

  // .
  // .
  // .
  // End of Subscribe of Message Status in Redis Pub Sub 

  /* ==========================================================
     TAXI / RIDE REDIS SUBSCRIBERS
  
     Handles Redis Pub/Sub events related to rides, pool rides,
     and e-commerce order tracking. Incoming Redis messages are
     forwarded to the appropriate Socket.IO rooms.
  ========================================================== */

  /* ==========================================================
     RIDE LOCATION UPDATES
  ========================================================== */
  redisSubscriber.pSubscribe("ride:*", async (message, channel) => {
    try {
      const data = JSON.parse(message);
      const rideId = channel.split(":")[1];
      io.to(rideId).emit("locationUpdateFromDriver", data);
      // Also emit unified stream event
      io.to(rideId).emit("rideStream", {
        type: "location",
        rideId,
        ts: Date.now(),
        data,
        v: 1,
      });
      console.info("Redis → Socket (Driver Location - Ride):", rideId, data);
    } catch (err) {
      console.error("Error parsing Redis message (ride):", err);
    }
  });

  /* ==========================================================
     RIDE STATUS UPDATES
  ========================================================== */
  redisSubscriber.pSubscribe("ride-status:*", async (message, channel) => {
    try {
      const evt = JSON.parse(message);
      const rideId = channel.split(":")[1];
      io.to(rideId).emit("rideStatusUpdate", evt);
      // Also emit unified stream event
      io.to(rideId).emit("rideStream", {
        type: "status",
        rideId,
        ts: Date.now(),
        data: evt,
        v: 1,
      });
      console.info("Redis → Socket (Ride Status):", rideId, evt);
    } catch (err) {
      console.error("Error parsing Redis ride-status message:", err);
    }
  });


  /* ==========================================================
    LIVE FARE UPDATES
 ========================================================== */
  redisSubscriber.pSubscribe("ride-fare:*", async (message, channel) => {
    try {
      const data = JSON.parse(message);
      const rideId = channel.split(":")[1];
      io.to(rideId).emit("liveFareUpdate", data); // Now includes status, totals, etc.
      // Also emit unified stream event
      io.to(rideId).emit("rideStream", {
        type: "fare",
        rideId,
        ts: Date.now(),
        data,
        v: 1,
      });
      console.info("Redis → Socket (Live Fare):", rideId, data);
    } catch (err) {
      console.error("Error parsing Redis live fare message:", err);
    }
  });

  /* ==========================================================
     POOL RIDE ACCEPTANCE UPDATES
  ========================================================== */
  redisSubscriber.pSubscribe("pool-accept:*", async (message, channel) => {
    try {
      const evt = JSON.parse(message);
      const requestId = channel.split(":")[1];

      io.to(requestId).emit("poolRideUpdate", evt);

      // unified stream (optional)
      io.to(requestId).emit("rideStream", {
        type: "pool-accept",
        requestId,
        ts: Date.now(),
        data: evt,
        v: 1,
      });

      console.info("Redis → Socket (Pool Accept):", requestId, evt);
    } catch (err) {
      console.error("Error parsing Redis pool-accept message:", err);
    }
  });

  /* ==========================================================
   POOL RIDE COORDINATE UPDATES
========================================================== */
  redisSubscriber.pSubscribe("pool-ride:*", async (message, channel) => {
    try {
      const data = JSON.parse(message);
      const poolRideId = channel.split(":")[1];

      // Send to everyone joined in this pool ride room
      io.to(poolRideId).emit("poolRideCoordinateUpdate", data);

      // Optional unified debug stream
      io.to(poolRideId).emit("rideStream", {
        type: "pool-coordinates",
        poolRideId,
        ts: Date.now(),
        data,
        v: 1,
      });

      console.info("Redis → Socket (Pool Ride Update):", poolRideId, data);
    } catch (err) {
      console.error("❌ Error parsing pool ride message:", err);
    }
  });

  /* ==========================================================
     ORDER LOCATION TRACKING UPDATES
  ========================================================== */
  redisSubscriber.pSubscribe(
    "order:*",
    async (message, channel) => {
      const data = JSON.parse(message);
      const orderId = channel.split(":")[1];

      io.to(orderId).emit(
        "orderTrackingUpdate",
        data
      );
    }
  );

  /* ==========================================================
     DELIVERY LOCATION TRACKING UPDATES
  ========================================================== */
  redisSubscriber.pSubscribe(
    "delivery:*",
    async (message, channel) => {
      try {
        const data = JSON.parse(message);
        const deliveryId = channel.split(":")[1];

        io.to(deliveryId).emit(
          "deliveryTrackingUpdate",
          data
        );

        io.to(deliveryId).emit("deliveryStream", {
          type: "delivery-location",
          deliveryId,
          ts: Date.now(),
          data,
          v: 1,
        });
      } catch (err) {
        console.error("Error parsing Redis delivery message:", err);
      }
    }
  );

  /* ==========================================================
     ORDER STATUS UPDATES
  ========================================================== */
  redisSubscriber.pSubscribe(
    "order-status:*",
    async (message, channel) => {
      try {
        const evt = JSON.parse(message);

        const orderId = channel.split(":")[1];

        io.to(orderId).emit(
          "orderStatusUpdate",
          evt
        );

        // Unified stream
        io.to(orderId).emit("orderStream", {
          type: "status",
          orderId,
          ts: Date.now(),
          data: evt,
          v: 1,
        });

        console.info(
          "Redis → Socket (Order Status):",
          orderId,
          evt
        );
      } catch (err) {
        console.error(
          "Error parsing Redis order-status message:",
          err
        );
      }
    }
  );

  /* =======================
       TAXI END redisSubscriber
    ======================= */

  // For example Driver will receiver about payment
  redisSubscriber.pSubscribe("update-receiver", async (message) => {
    console.info('redis subscriber of update receiver')
    const payload = JSON.parse(message);
    if (!(await claimOnce("update-receiver", message, null, 30))) return;

    const phoneNumber: any = String(payload.phoneNumber); // ensure number; // always present
    // const socketId = userSocketMap.get(phoneNumber) as string;
    // const socketId = JSON.parse(await redisClient.hGet("userSocketMap", String(payload.phoneNumber)) || "[]");
    const socketId = JSON.parse(await redisClient.hGet("userSocketMap:role:taxi", String(payload.phoneNumber)) || "[]");

    if (socketId.length) {
      const driverReceivingData = payload.logData[0]
      io.to(socketId).emit("transaction:update", driverReceivingData);
      console.info(`📲 Emitted txn update to ${phoneNumber}  | receiver`);
    } else {
      console.info(`⚠️ No active socket found for ${phoneNumber}`);
    }
  });

  redisSubscriber.pSubscribe("updateusertransaction", async (message) => {
    console.info('redis subscriber of update user')
    // const event = channel.split(":")[1];

    // const { data, conversationId } = JSON.parse(message);
    const { logData: data, conversationId } = JSON.parse(message);
    console.info('redis | data and converstation id | ', data, conversationId)

    // const mobileNum = transactionUserMap.get(data[0].referenceId)
    const mobileNum = String(transactionUserMap.get(data[0].referenceId));
    console.info('redis txn map | ', transactionUserMap.entries())
    if (!mobileNum || mobileNum === "undefined" || mobileNum === undefined) {
      console.info('mobile number not found')
      return;
    }
    console.info(`mobileNum | ${mobileNum}`)

    if (!(await claimOnce("updateusertransaction", message, null, 30))) return;

    if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
      const eventObj = {
        conversationId: conversationId,
        messageId: new mongoose.Types.ObjectId(),
        senderId: mobileNum,
        content: data[0],
        messageType: 'money',
        status: 'delivered',
        timestamp: new Date(),
      };

      let convMember = await getConversationMembers(conversationId);
      for (let member of convMember) {
        // if (member == eventObj.senderId) continue;
        const userSocketMap = JSON.parse(await redisClient.hGet("userSocketMap", member.toString()) || "[]");
        // const isOnline = await redisClient.get(`user:${member}:online`);
        // io.to(data.conversationId.toString()).emit("chat:recv-message", data);
        console.info("chat money sent to :", member, "User Socket Map :", userSocketMap)
        if (userSocketMap.length) io.to(userSocketMap).emit("chat:recv-message", eventObj);
        producer.send({
          topic: "offline-chat-messages",
          messages: [{ value: JSON.stringify({ ...eventObj, member }) }],
        });
      }

      console.info(`pushed user for save transaction in chat`);
    }

    // get socket id
    // const socketId = userSocketMap.get(mobileNum) as string
    const socketId = JSON.parse(await redisClient.hGet("userSocketMap", String(mobileNum)) || "[]");
    // console.info(`mobile= ${mobileNum} --> socketIds= ${socketId}`,)

    const failedTransaction = data[0].status
    console.info(`transaction status | ${failedTransaction}`)

    const payloadToSend = conversationId ? { ...data[0], conversationId } : data[0];

    if (failedTransaction === "failed") {
      if (socketId.length) io.to(socketId).emit("transaction:error", payloadToSend)
      console.info(`📲 Emitted FAILED txn update to user`);
    } else {
      if (socketId.length) io.to(socketId).emit("transaction:update", payloadToSend)
      console.info(`📲 Emitted SUCCESS txn update to user`);
    }
    // let senderSocketId = JSON.parse(await redisClient.hGet("userSocketMap", String(mobileNum)) || "[]");
    // let payData = {
    //   id: data[0].referenceId,
    //   qr_id: data[0].qr_id,
    //   referenceId: data[0].referenceId,
    //   senderWalletId: data[0].walletId,
    //   receiverWalletId: data[0].counterpartyWalletId,
    //   amount: data[0].amount,
    // }
    // if (senderSocketId.length) io.to(senderSocketId).emit("qr:expired", payData)
  })

  // .
  // End of Subscribe of Message Status in Redis Pub Sub


  /*
  This service is created for just testing purpose of wallet events
  */

  redisSubscriber.pSubscribe("txnlog-publisher", async (message) => {
    try {
      // const event = channel.split(":")[1];
      const payload = JSON.parse(message);
      if (!(await claimOnce("txnlog-publisher", message, null, 30))) return;

      // update mongodb in transaction-service
      io.to("transaction-services").emit("wallet:save-to-db", payload)
    } catch (err) {
      console.error(`redis subscribe error in transaction | ${(err as Error).message}`)
    }

  })


  redisSubscriber.pSubscribe("updating-receiver", async (message) => {
    const payload = JSON.parse(message);

    if (!(await claimOnce("updating-receiver", message, null, 30))) return;

    const phoneNumber: any = Number(payload.phoneNumber); // ensure number; // always present
    // const socketId = userSocketMap.get(phoneNumber) as string;
    const socketId = JSON.parse(await redisClient.hGet("userSocketMap", phoneNumber) || "[]");

    if (socketId.length) {
      io.to(socketId).emit("wallet:success-update", payload.data);
    } else {
      console.info(`⚠️ No active socket found for ${phoneNumber}`);
    }
  });


  redisSubscriber.pSubscribe("updating-user", async (message) => {
    const { data, phone } = JSON.parse(message);
    if (!(await claimOnce("updating-user", message, null, 30))) return;

    // const socketId = userSocketMap.get(phone) as string;
    const socketId = JSON.parse(await redisClient.hGet("userSocketMap", phone) || "[]");
    if (!socketId.length) {
      console.info(`❌ Socket not found for phone: ${phone}`);
      return;
    }

    io.to(socketId).emit("wallet:success-update", data);
  });




  const port = Number(process.env.SOCKET_PORT || 4022);
  httpServer.listen(port, async () => {
    console.info(`WebSocket server running on port ${port}`);
  });

  // .
  // End of Socket Port Listening
};
