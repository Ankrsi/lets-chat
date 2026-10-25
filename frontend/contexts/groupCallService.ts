import { currentScreen } from "@/app/_layout";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from 'expo-crypto';
import { router } from "expo-router";
import * as mediasoupClient from "mediasoup-client";
import { DeviceEventEmitter } from "react-native";
import InCallManager from "react-native-incall-manager";
import notifee from '@notifee/react-native';
import {
  mediaDevices,
  MediaStream,
  registerGlobals,
} from "react-native-webrtc";
import type { Socket } from "socket.io-client";

// Register react-native-webrtc globals so mediasoup-client can find
// RTCPeerConnection, RTCRtpSender, etc.
registerGlobals();

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsumerEntry {
  consumerId: string;
  producerId: string;
  userId: string;
  stream: MediaStream;
}

export interface GroupCallIncomingPayload {
  callId: string;
  from: string;
  conversationId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED MUTABLE STATE  (read from UI layer, mutated only inside this file)
// ─────────────────────────────────────────────────────────────────────────────

let localStream: MediaStream | null = null;
export let audioGroupSpeakerState = false;
let consumers: ConsumerEntry[] = []; // remote participants
let currentGroupCallId: string | null = null;
let currentConversationId: string | null = null;

// Mediasoup internals — not needed by UI but exported for debugging
let msDevice: mediasoupClient.types.Device | null = null;
let sendTransport: mediasoupClient.types.Transport | null = null;
let recvTransport: mediasoupClient.types.Transport | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL STATE
// ─────────────────────────────────────────────────────────────────────────────

// Callback the UI layer registers to be notified of consumer list changes
export const AudioCallEvents = DeviceEventEmitter;
export const getAudioGroupConsumers = (): ConsumerEntry[] => [...consumers];

// ─────────────────────────────────────────────────────────────────────────────
// SOCKET LISTENERS
// ─────────────────────────────────────────────────────────────────────────────

export const registerGroupCallHandlers = (socket: Socket, myId: string): void => {
  const GROUP_CALL_SOCKET_EVENTS = [
    "group:audio-incoming",
    "newProducer",
    "userLeft",
    "producerClosed",
    "activeSpeakers",
    "userMuteState"
  ];
  GROUP_CALL_SOCKET_EVENTS.forEach((sock) => {
    socket?.off(sock);
  });

  // ── Incoming call ──────────────────────────────────────────────────────────
  socket?.on(
    "group:audio-incoming",
    ({ callId, from, conversationId }: GroupCallIncomingPayload) => {
      InCallManager.startRingtone("_DEFAULT_", 0, "default", 25);
      currentGroupCallId = callId;
      currentConversationId = conversationId;

      router.push({
        pathname: "/screens/callScreens/incomingCall",
        params: { data: JSON.stringify({ callId, fromm: from, conversationId, callType: "groupCall" }) },
      });
    }
  );

  // ── A new participant started producing ────────────────────────────────────
  socket?.on("newProducer", async ({ producerId, userId: producerUserId }: { producerId: string; userId: string; }) => {
    if (producerUserId === myId) return;
    await consumeRemote(socket, myId, producerId, producerUserId);
  });

  // ── Participant left ───────────────────────────────────────────────────────
  socket?.on("userLeft", async({ userId: leftUserId }: { userId: string }) => {
    let notification = JSON.parse(await AsyncStorage.getItem('last_notification') || "{}");
    await notifee.cancelNotification(notification?.id || "");
    consumers = consumers.filter((c) => c.userId !== leftUserId);
    if (consumers.length == 0) {
      cleanupGroupCall();
      if (currentScreen === "screens/callScreens/inCall") {
        if (router.canDismiss()) router.dismiss();
      }
    }
    AudioCallEvents.emit("group-audio-update-consumers", [...consumers]);
  });

  // ── Producer closed by server ──────────────────────────────────────────────
  socket?.on("producerClosed", ({ producerId }: { producerId: string }) => {
    consumers = consumers.filter((c) => c.producerId !== producerId);
    AudioCallEvents.emit("group-audio-update-consumers", [...consumers]);
  });

  // Who is speaking (from server AudioLevelObserver)
  socket?.on("activeSpeakers", (speakers: Array<{ userId: string; volume: number }>) => {
    AudioCallEvents.emit("group-audio-speaking-changed", speakers);
  });

  // Remote user mute/unmute
  socket?.on("userMuteState", ({ userId, muted }: { userId: string; muted: boolean }) => {
    AudioCallEvents.emit("group-audio-mute-changed", { userId, muted });
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER USER
// ─────────────────────────────────────────────────────────────────────────────

export const registerUser = (socket: Socket, userId: string): void => {
  socket?.emit("registerUser", { senderId: userId });
};

// ─────────────────────────────────────────────────────────────────────────────
// START CALL NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export const handleIncommingGroupAudioCall = async ({ socket, callId, from, conversationId, myId }: any) => {
  InCallManager.startRingtone("_DEFAULT_", 0, "default", 25);
  currentGroupCallId = callId;
  currentConversationId = conversationId;
  await acceptGroupCall(socket, myId)
};

// ─────────────────────────────────────────────────────────────────────────────
// START CALL  (caller side)
// ─────────────────────────────────────────────────────────────────────────────

export const startGroupCall = async (
  socket: Socket,
  myId: string,
  conversationId: string
): Promise<void> => {
  const callId = Crypto.randomUUID();
  currentGroupCallId = callId;
  currentConversationId = conversationId;

  socket?.emit("group:audio-start-call", {
    callId,
    from: myId,
    conversationId,
  });

  await joinRoom(socket, myId, conversationId);

  router.push({
    pathname: "/screens/callScreens/inCall",
    params: { callId, from: myId, conversationId, callType: "groupCall" },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// JOIN ROOM  (shared by startGroupCall and acceptGroupCall)
// ─────────────────────────────────────────────────────────────────────────────

export const joinRoom = async (
  socket: Socket,
  myId: string,
  conversationId: string
): Promise<void> => {
  if (msDevice) {
    console.warn("joinRoom: already joined, skipping");
    return;
  }

  const { rtpCapabilities, existingProducers } = await socket?.emitWithAck("joinRoom", 
    { conversationId, userId: myId, callId: currentGroupCallId, timestamp: new Date().toISOString() }
  );

  // Load mediasoup device
  msDevice = new mediasoupClient.Device();
  await msDevice.load({ routerRtpCapabilities: rtpCapabilities });

  // Create send transport + start producing
  await createSendTransportAndProduce(socket, myId, conversationId);

  // Consume every producer already in the room
  for (const p of existingProducers as Array<{ producerId: string; userId: string }>) {
    await consumeRemote(socket, myId, p.producerId, p.userId);
  }

  try {
    InCallManager.start({ media: "audio", auto: true });
    InCallManager.setSpeakerphoneOn(true);
    audioGroupSpeakerState = true;
  } catch (e) {
    console.warn("InCallManager start failed", e);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPT CALL  (callee side)
// ─────────────────────────────────────────────────────────────────────────────

export const acceptGroupCall = async (
  socket: Socket,
  myId: string
): Promise<void> => {
  if (!currentConversationId) {
    console.warn("acceptGroupCall: no conversationId set");
    return;
  }
  await joinRoom(socket, myId, currentConversationId);
  router.push({
    pathname: "/screens/callScreens/inCall",
    params: {
      callId: currentGroupCallId,
      from: myId,
      conversationId: currentConversationId,
      callType: "groupCall",
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// REJECT CALL
// ─────────────────────────────────────────────────────────────────────────────

export const rejectGroupCall = (): void => {
  InCallManager.stopRingtone();
  currentGroupCallId = null;
  currentConversationId = null;
  if (router.canDismiss()) router.dismiss();
};

// ─────────────────────────────────────────────────────────────────────────────
// END CALL
// ─────────────────────────────────────────────────────────────────────────────

export const endGroupCall = (socket: Socket, myId: string): void => {
  socket?.emit("leaveRoom", {
    userId: myId,
    conversationId: currentConversationId,
    callId: currentGroupCallId, 
    timestamp: new Date().toISOString()
  });

  cleanupGroupCall();

  if (currentScreen === "screens/callScreens/inCall") {
    if (router.canDismiss()) router.dismiss();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: cleanup
// ─────────────────────────────────────────────────────────────────────────────

export const cleanupGroupCall = (): void => {
  try {
    sendTransport?.close();
    sendTransport = null;
  } catch (_) { }

  try {
    recvTransport?.close();
    recvTransport = null;
  } catch (_) { }

  try {
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
  } catch (_) { }

  try {
    InCallManager.setSpeakerphoneOn(false);
    audioGroupSpeakerState = false;
  } catch (_) { }

  consumers = [];
  AudioCallEvents.emit("group-audio-update-consumers", [...consumers]);

  msDevice = null;
  currentGroupCallId = null;
  currentConversationId = null;

  console.log("📌 Group call state fully reset");
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: create send transport + produce audio
// ─────────────────────────────────────────────────────────────────────────────

const createSendTransportAndProduce = async (
  socket: Socket,
  myId: string,
  conversationId: string
): Promise<void> => {
  const device = msDevice!;

  const params = await socket?.emitWithAck("createTransport", { type: "send" });
  const transport = device.createSendTransport(params);

  transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
    try {
      await socket?.emitWithAck("connectTransport", {
        transportId: transport.id,
        dtlsParameters,
      });
      callback();
    } catch (err: any) {
      errback(err);
    }
  });

  transport.on(
    "produce",
    async ({ kind, rtpParameters }: any, callback, errback) => {
      try {
        const { id } = await socket?.emitWithAck("produce", {
          conversationId,
          transportId: transport.id,
          kind,
          rtpParameters,
          appData: { userId: myId },
        });
        callback({ id });
      } catch (err: any) {
        errback(err);
      }
    }
  );

  sendTransport = transport;

  // Get mic stream
  if (!localStream) {
    localStream = await (mediaDevices as any).getUserMedia({
      audio: true,
      video: false,
    });
  }

  const track = (localStream as any).getAudioTracks()[0];

  await transport.produce({
    track,
    codecOptions: { opusStereo: false, opusDtx: true },
  });

  console.log("🎙️ Audio producing started");
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: consume a remote producer
// ─────────────────────────────────────────────────────────────────────────────

const consumeRemote = async (
  socket: Socket,
  myId: string,
  producerId: string,
  producerUserId: string
): Promise<void> => {
  if (consumers.some((c) => c.producerId === producerId)) {
    console.warn("consumeRemote: already consuming", producerId);
    return;
  }

  const device = msDevice;
  if (!device) {
    console.warn("consumeRemote: device not loaded yet");
    return;
  }

  // Create recv transport once
  if (!recvTransport) {
    const params = await socket?.emitWithAck("createTransport", { type: "recv" });
    const transport = device.createRecvTransport(params);

    transport.on(
      "connect",
      async ({ dtlsParameters }: any, callback, errback) => {
        try {
          await socket?.emitWithAck("connectTransport", {
            transportId: transport.id,
            dtlsParameters,
          });
          callback();
        } catch (err: any) {
          errback(err);
        }
      }
    );

    recvTransport = transport;
  }

  const { id, kind, rtpParameters } = await socket?.emitWithAck("consume", {
    conversationId: currentConversationId,
    producerId,
    rtpCapabilities: device.rtpCapabilities,
  });

  const consumer = await recvTransport.consume({
    id,
    producerId,
    kind,
    rtpParameters,
  });

  consumer.resume();

  const stream = new MediaStream([consumer.track as any]);

  consumers = [
    ...consumers,
    {
      consumerId: consumer.id,
      producerId,
      userId: producerUserId,
      stream: stream as unknown as MediaStream,
    },
  ];

  AudioCallEvents.emit("group-audio-update-consumers", [...consumers]);
  console.log("🔊 Consuming audio from:", producerUserId);
};

// ─────────────────────────────────────────────────────────────────────────────
// TOGGLE MUTE  (mutes/unmutes local mic track)
// ─────────────────────────────────────────────────────────────────────────────

export const groupToggleMute = (): boolean => {
  if (!localStream) return false;
  const audioTrack = (localStream as any).getAudioTracks()[0];
  if (!audioTrack) return false;
  audioTrack.enabled = !audioTrack.enabled;
  return !audioTrack.enabled; // returns true if now muted
};
