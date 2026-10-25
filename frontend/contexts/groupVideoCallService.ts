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

export let groupVideoLocalStream: MediaStream | null = null;
export let speakerState = false;
export let videoGroupCallConsumers: ConsumerEntry[] = []; // remote participants
let currentGroupCallId: string | null = null;
let currentConversationId: string | null = null;
let currentCallType: "audio" | "video" = "video";
let videoProducer: mediasoupClient.types.Producer | null = null;
const consumersByProducer = new Map<string, { consumer: any; userId: string }>();

// Mediasoup internals — not needed by UI but exported for debugging
let msDevice: mediasoupClient.types.Device | null = null;
let sendTransport: mediasoupClient.types.Transport | null = null;
let recvTransport: mediasoupClient.types.Transport | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL STATE
// ─────────────────────────────────────────────────────────────────────────────

// Callback the UI layer registers to be notified of consumer list changes
export const VideoCallEvents = DeviceEventEmitter;
export const getVideoGroupConsumers = (): ConsumerEntry[] => [...videoGroupCallConsumers];

// ─────────────────────────────────────────────────────────────────────────────
// SOCKET LISTENERS
// ─────────────────────────────────────────────────────────────────────────────

export const registerGroupVideoCallHandlers = (socket: Socket, myId: string): void => {
  const GROUP_VIDEO_CALL_SOCKET_EVENTS = [
    "group:video-incoming",
    "video:newProducer",
    "video:userLeft",
    "video:producerClosed",
    "video:activeSpeakers",
    "video:userMuteState",
    "video:call-type-switched"
  ];
  GROUP_VIDEO_CALL_SOCKET_EVENTS.forEach((sock) => {
    socket?.off(sock);
  });

  // ── Incoming call ──────────────────────────────────────────────────────────
  socket?.on(
    "group:video-incoming",
    ({ callId, from, conversationId }: GroupCallIncomingPayload) => {
      InCallManager.startRingtone("_DEFAULT_", 0, "default", 25);
      currentGroupCallId = callId;
      currentConversationId = conversationId;

      router.push({
        pathname: "/screens/callScreens/videoIncomingCall",
        params: { data: JSON.stringify({ callId, fromm: from, conversationId, callType: "groupCall" }) },
      });
    }
  );

  // ── A new participant started producing ────────────────────────────────────
  socket?.on("video:newProducer", async ({ producerId, userId: producerUserId }: { producerId: string; userId: string; }) => {
    if (producerUserId === myId) return;
    await consumeRemote(socket, myId, producerId, producerUserId);
  });

  // ── Participant left ───────────────────────────────────────────────────────
  socket?.on("video:userLeft", async ({ userId: leftUserId }: { userId: string }) => {
    let notification = JSON.parse(await AsyncStorage.getItem('last_notification') || "{}");
    await notifee.cancelNotification(notification?.id || "");
    videoGroupCallConsumers = videoGroupCallConsumers.filter((c) => c.userId !== leftUserId);
    if (videoGroupCallConsumers.length == 0) {
      cleanupGroupCall();
      if (currentScreen === "screens/callScreens/videoInCall") {
        if (router.canDismiss()) router.dismiss();
      }
    }
  });

  socket?.on("video:producerClosed", ({ producerId }: { producerId: string }) => {
    const rec = consumersByProducer.get(producerId);
    if (rec) {
      try { rec.consumer.close(); } catch (_) { }
      const entry = videoGroupCallConsumers.find((c) => c.userId === rec.userId);
      if (entry) {
        try { (entry.stream as any).removeTrack(rec.consumer.track); } catch (_) { }
        if ((entry.stream as any).getTracks().length === 0) {
          videoGroupCallConsumers = videoGroupCallConsumers.filter((c) => c.userId !== rec.userId);
        }
      }
      consumersByProducer.delete(producerId);
    }
    VideoCallEvents.emit("group-video-update-consumers", videoGroupCallConsumers);
  });

  // Who is speaking (from server AudioLevelObserver)
  socket?.on("video:activeSpeakers", (speakers: Array<{ userId: string; volume: number }>) => {
    VideoCallEvents.emit("group-video-speaking-changed", speakers);
  });

  // Remote user mute/unmute
  socket?.on("video:userMuteState", ({ userId, muted }: { userId: string; muted: boolean }) => {
    VideoCallEvents.emit("group-video-mute-changed", { userId, muted });
  });

  socket?.on("video:call-type-switched", ({ userId, callType }: { userId: string; callType: "audio" | "video" }) => {
    currentCallType = callType;
    VideoCallEvents.emit("group-video-calltype-changed", { userId, callType });
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

export const handleIncommingGroupVideoCall = async ({ socket, callId, from, conversationId, myId }: any) => {
  InCallManager.startRingtone("_DEFAULT_", 0, "default", 25);
  currentGroupCallId = callId;
  currentConversationId = conversationId;
  await acceptVideoGroupCall(socket, myId)
};

// ─────────────────────────────────────────────────────────────────────────────
// START CALL  (caller side)
// ─────────────────────────────────────────────────────────────────────────────

export const startGroupVideoCall = async (
  socket: Socket,
  myId: string,
  conversationId: string,
  callType: "audio" | "video" = "video"
): Promise<void> => {
  const callId = Crypto.randomUUID();
  currentGroupCallId = callId;
  currentConversationId = conversationId;
  socket?.emit("group:video-start-call", {
    callId,
    from: myId,
    conversationId,
    callType
  });

  await joinRoom(socket, myId, conversationId);

  router.push({
    pathname: "/screens/callScreens/videoInCall",
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
  const response = await socket?.emitWithAck("video:joinRoom",
    { conversationId, userId: myId, callId: currentGroupCallId, timestamp: new Date().toISOString() }
  );

  if (!response || !response.rtpCapabilities) {
    console.error("Invalid joinRoom response:", response);
    throw new Error("rtpCapabilities not received from server");
  }
  const { rtpCapabilities, existingProducers, callType } = response;

  if (callType) currentCallType = callType;

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
    InCallManager.start({ media: "video", auto: true });
    InCallManager.setSpeakerphoneOn(true);
    speakerState = true;
  } catch (e) {
    console.warn("InCallManager start failed", e);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPT CALL  (callee side)
// ─────────────────────────────────────────────────────────────────────────────

export const acceptVideoGroupCall = async (
  socket: Socket,
  myId: string
): Promise<void> => {
  if (!currentConversationId) {
    console.warn("acceptGroupCall: no conversationId set");
    return;
  }

  await joinRoom(socket, myId, currentConversationId);

  router.push({
    pathname: "/screens/callScreens/videoInCall",
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

export const rejectVideoGroupCall = (): void => {
  InCallManager.stopRingtone();
  currentGroupCallId = null;
  currentConversationId = null;
  if (router.canDismiss()) router.dismiss();
};

// ─────────────────────────────────────────────────────────────────────────────
// END CALL
// ─────────────────────────────────────────────────────────────────────────────

export const endVideoGroupCall = (socket: Socket, myId: string): void => {
  socket?.emit("video:leaveRoom", {
    userId: myId,
    conversationId: currentConversationId,
    callId: currentGroupCallId,
    timestamp: new Date().toISOString()
  });

  cleanupGroupCall();

  if (currentScreen === "screens/callScreens/videoInCall") {
    if (router.canDismiss()) router.dismiss();
  }
};

//
//
//

export const switchCallType = async (socket: Socket, myId: string, callType: "audio" | "video"): Promise<void> => {
  socket?.emit("video:switch-call-type", {
    callId: currentGroupCallId,
    conversationId: currentConversationId,
    userId: myId,
    callType,
  });
  currentCallType = callType;

  if (callType === "audio") {
    try { videoProducer?.close(); } catch (_) { }
    videoProducer = null;
    const vTrack = (groupVideoLocalStream as any)?.getVideoTracks?.()[0];
    if (vTrack) { vTrack.stop(); (groupVideoLocalStream as any)?.removeTrack(vTrack); }
  } else {
    if (!sendTransport) return;
    let vTrack = (groupVideoLocalStream as any)?.getVideoTracks?.()[0];
    if (!vTrack) {
      const camStream = await (mediaDevices as any).getUserMedia({ video: true });
      vTrack = camStream.getVideoTracks()[0];
      (groupVideoLocalStream as any)?.addTrack(vTrack);
    }
    videoProducer = await sendTransport.produce({ track: vTrack });
  }
  VideoCallEvents.emit("group-video-calltype-changed", { userId: myId, callType });
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
    if (groupVideoLocalStream) {
      groupVideoLocalStream.getTracks().forEach((t) => t.stop());
      groupVideoLocalStream = null;
      videoGroupCallConsumers = [];
    }
  } catch (_) { }

  try {
    InCallManager.setSpeakerphoneOn(false);
    speakerState = false;
  } catch (_) { }

  videoGroupCallConsumers = [];

  msDevice = null;
  currentGroupCallId = null;
  currentConversationId = null;
  consumersByProducer.clear();

  console.log("📌 Video Group call state fully reset");
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

  const params = await socket?.emitWithAck("video:createTransport", { type: "send" });
  const transport = device.createSendTransport(params);

  transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
    try {
      await socket?.emitWithAck("video:connectTransport", {
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
        const { id } = await socket?.emitWithAck("video:produce", {
          conversationId,
          transportId: transport.id,
          kind,
          rtpParameters,
        });
        callback({ id });
      } catch (err: any) {
        errback(err);
      }
    }
  );

  sendTransport = transport;

  // Get mic stream
  if (!groupVideoLocalStream) {
    groupVideoLocalStream = await (mediaDevices as any).getUserMedia({
      audio: true,
      video: currentCallType === "video",
    });
  }

  const audioTrack = (groupVideoLocalStream as any).getAudioTracks()[0];
  await transport.produce({ track: audioTrack, codecOptions: { opusStereo: false, opusDtx: true } });
  if (currentCallType === "video") {
    const videoTrack = (groupVideoLocalStream as any).getVideoTracks()[0];
    videoProducer = await transport.produce({ track: videoTrack });
  }

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
  const device = msDevice;
  if (!device) {
    console.warn("consumeRemote: device not loaded yet");
    return;
  }

  // Create recv transport once
  if (!recvTransport) {
    const params = await socket?.emitWithAck("video:createTransport", { type: "recv" });
    const transport = device.createRecvTransport(params);

    transport.on(
      "connect",
      async ({ dtlsParameters }: any, callback, errback) => {
        try {
          await socket?.emitWithAck("video:connectTransport", {
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

  const { id, kind, rtpParameters } = await socket?.emitWithAck("video:consume", {
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

  consumersByProducer.set(producerId, { consumer, userId: producerUserId });

  const existing = videoGroupCallConsumers.find((c) => c.userId === producerUserId);

  consumer.track.onmute = () => {
    console.log("Video muted", producerUserId);
  };

  consumer.track.onunmute = () => {
    console.log("Video resumed", producerUserId);
  };

  if (existing) {
    (existing.stream as any).addTrack(consumer.track);
  }
  else {
    const stream = new MediaStream([consumer.track as any]);

    videoGroupCallConsumers = [
      ...videoGroupCallConsumers,
      {
        consumerId: consumer.id,
        producerId,
        userId: producerUserId,
        stream: stream as unknown as MediaStream,
      },
    ];
  }

  console.log("🔊 Consuming video/audio from:", producerUserId);
};

// ─────────────────────────────────────────────────────────────────────────────
// TOGGLE MUTE  (mutes/unmutes local mic track)
// ─────────────────────────────────────────────────────────────────────────────

export const videoToggleAudio = (): boolean => {
  if (!groupVideoLocalStream) return false;
  const audioTrack = (groupVideoLocalStream as any).getAudioTracks()[0];
  if (!audioTrack) return false;
  audioTrack.enabled = !audioTrack.enabled;
  return !audioTrack.enabled; // returns true if now muted
};

// ─────────────────────────────────────────────────────────────────────────────
// TOGGLE CAMERA  (enables/disables local video track)
// ─────────────────────────────────────────────────────────────────────────────
export const videoToggleCamera = (): boolean => {
  if (!groupVideoLocalStream) return false;
  const videoTrack = (groupVideoLocalStream as any).getVideoTracks()[0];
  if (!videoTrack) return false;
  videoTrack.enabled = !videoTrack.enabled;
  console.log("Camera toggled, enabled:", videoTrack.enabled);
  return !videoTrack.enabled; // true = camera OFF
};

