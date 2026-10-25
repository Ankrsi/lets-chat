import { currentScreen } from "@/app/_layout";
import { updateAudioStatus } from "@/db/callsRepo";
import { updateConversationLastMessage } from "@/db/conversationRepo";
import { saveMessage } from "@/db/messageRepo";
import * as Crypto from 'expo-crypto';
import { router } from "expo-router";
import InCallManager from 'react-native-incall-manager';
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from "react-native-webrtc";
import type { Socket } from "socket.io-client";
import { startVideoCall } from "./videoCallController";
import { RTCSessionDescriptionInit } from "react-native-webrtc/lib/typescript/RTCSessionDescription";

export interface CallOfferPayload {
  callId: string;
  from: string;
  to: string;
  offer?: RTCSessionDescriptionInit;
  offerType: string;
  conversationId: string;
}

export interface CallAnswerPayload {
  callId: string;
  from: string;
  to?: string;
  answer: RTCSessionDescriptionInit;
}

export interface IceCandidatePayload {
  callId: string;
  from: string;
  to?: string;
  candidate: RTCIceCandidateInit;
}

export interface PeerData {
  pc: RTCPeerConnection | null;
  pendingCandidates: RTCIceCandidateInit[];
  remoteStream: MediaStream | null;
}

const pcConfig: RTCConfiguration = {
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302"
      ]
    },
    {
      urls: [
        "turn:13.36.13.236:3478?transport=tcp",
        "turn:13.36.13.236:3478?transport=udp",
        "turns:omnia.onsdlc.cloud:5349",
      ],
      username: "sdlccorp@superapp@eventserverturn",
      credential: "superappturn1a9k9s7.@sdlccorp.@docker"
    },
  ],
}

export let ringtoneTime = 25;
export let speakerState = false;
export let peerConnection: Record<string, PeerData> = {};
export let localStream: MediaStream | null = null;
let currentCallId: string | null = null;
let conversationId: string | null = null;

let pendingOffers: { callId: string; offer?: RTCSessionDescriptionInit, from: string, offerType: string }[] = [];

export const cleanupPeer = (remoteId: string) => {
  const p = peerConnection[remoteId];
  if (!p) return;

  try {
    p.pc?.close();
  } catch (err) {
    console.info(err)
  }

  delete peerConnection[remoteId];

  // If no peers left, stop audio manager
  if (Object.keys(peerConnection).length < 1) {
    try {
      InCallManager.stop(); 
      InCallManager.setSpeakerphoneOn(false);
      speakerState = false;
      peerConnection = {};
      console.log("📌 No peers left, stopped InCallManager for", remoteId);
    } catch (e) {
      console.warn('InCallManager stop failed', e);
    }
  }

  if (Object.keys(peerConnection).length < 1 && localStream) {
    localStream.getTracks().forEach(t => {
      t.stop();
      t.enabled = false;
      console.log("📌 Stopped local stream track:", t.kind);
    });
    localStream = null;
  }
};

export const createPeerConnection = async (
  socket: Socket,
  myId: string,
  to: string
): Promise<RTCPeerConnection> => {
  if (
    peerConnection[to] &&
    peerConnection[to].pc &&
    peerConnection[to].pc.connectionState !== "closed" &&
    localStream
  ) {
    return peerConnection[to].pc;
  }

  if (peerConnection[to] && peerConnection[to].pc) {
    try { peerConnection[to].pc.close(); } catch (_) { }
    peerConnection[to].pc.getSenders().forEach((sender) => {
      try { peerConnection[to].pc?.removeTrack(sender); } catch (_) { }
    });
  }

  if (!localStream) {
    localStream = await mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } as any,
      video: false
    });
  }

  try {
    InCallManager.start({ media: 'audio', auto: true });
    InCallManager.setSpeakerphoneOn(true);
    speakerState = true;
  } catch (e) {
    console.warn('InCallManager start failed in createPeerConnection', e);
  }

  const pc = new RTCPeerConnection(pcConfig);

  peerConnection[to] = {
    pc,
    pendingCandidates: [],
    remoteStream: null,
  };

  localStream?.getAudioTracks().forEach(track => {
    const alreadyAdded = pc.getSenders().some(sender => sender.track === track);
    if (!alreadyAdded) {
      try { pc.addTrack(track, localStream!); } catch (err) {
        console.warn("Defensive addTrack error", err);
      }
    }
  });

  (pc as any).onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    if (!event.candidate) return;
    const payload: IceCandidatePayload = {
      callId: currentCallId!,
      from: myId,
      to,
      candidate: event.candidate.toJSON()
    };
    socket?.emit("call:ice-candidate", payload);
  };

  (pc as any).ontrack = (event: any) => {
    const remoteStream = event.streams && event.streams[0];
    if (!remoteStream) return;
    peerConnection[to].remoteStream = remoteStream;
  };

  (pc as any).onconnectionstatechange = async () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      cleanupPeer(to);
    }
  };
  (pc as any).oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
      pc.restartIce();
    }
    console.log("ICE:", pc.iceConnectionState);
  };

  (pc as any).getStats().then((stats: any) => {
    stats.forEach((report: any) => {
      console.log("report:", report);
    });
  });

  return pc;
};

// ###### switch to video call
export const upgradeToVideo = async (socket: Socket, myId: string, to: string, conversationId: string): Promise<void> => {
  if (Object.keys(peerConnection).length !== 1) return;
  cleanupPeer(Object.keys(peerConnection)[0]);
  endCall(socket, myId, conversationId!);
  await startVideoCall(socket, myId, to, conversationId!, () => { }, "video", true);
}

// ────────────────────────────────────────────────────────────────
// SOCKET LISTENERS
// ────────────────────────────────────────────────────────────────

export const registerCallHandlers = (socket: Socket, myId: string): void => {
  const CALL_SOCKET_EVENTS = [
    "call:call-details",
    "call:incoming",
    "call:answer",
    "call:ice-candidate",
    "call:released",
    "call:unavailable",
    "call:ended",
    "call:add-incoming",
    "call:add-incoming-accepted",
    "call:add-answer",
    "call:add-offer",
    "call:existing-participants",
    "call:new-participant"
  ];
  CALL_SOCKET_EVENTS.forEach((sock) => {
    socket?.off(sock);
  });

  socket?.on("call:call-details", ({ callId, from, to }) => {
    currentCallId = callId;
  });

  socket?.on("call:incoming", ({ callId, from, to, offer, offerType, conversationId: convId }: CallOfferPayload) => {
    InCallManager.startRingtone('_DEFAULT_', 0, 'default', ringtoneTime);
    pendingOffers.push({ callId, offer, from, offerType });
    currentCallId = callId;
    conversationId = convId;
    router.push({
      pathname: "/screens/callScreens/incomingCall",
      params: { callId, from, to, conversationId },
    });
  });

  socket?.on("call:answer", async ({ callId, from, answer }: CallAnswerPayload) => {
    const ent = peerConnection[from];
    if (!ent || !ent.pc) return;

    await ent.pc.setRemoteDescription(new RTCSessionDescription(answer as any));
    ent.pendingCandidates.forEach(c =>
      ent.pc?.addIceCandidate(new RTCIceCandidate(c))
    );
    ent.pendingCandidates = [];
  });

  socket?.on("call:ice-candidate", async ({ callId, from, candidate }: IceCandidatePayload) => {
    if (!from || !candidate) return;

    if (!peerConnection[from]) {
      peerConnection[from] = { pc: null, pendingCandidates: [], remoteStream: null };
    }
    const ent = peerConnection[from];
    if (!ent.pc) {
      ent.pendingCandidates.push(candidate);
      return;
    }
    try {
      await ent.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.info("ICE add error:", e);
    }
  });

  socket?.on("call:released", async ({ callId, from, reason }) => {
    if (currentScreen === "screens/callScreens/inCall") {
      router.dismiss();
    }
  });

  socket?.on("call:unavailable", () => {
    console.log("call not connected")
  });

  socket?.on("call:ended", async ({ callId, from, reason }) => {
    if (currentScreen === "screens/callScreens/inCall" && Object.keys(peerConnection).length == 1) {
      if (router.canDismiss()) router.dismiss();
      currentCallId = null;
    }
    cleanupPeer(from);
  });

  socket?.on("call:add-incoming", ({ callId, from, newUser, offerType }) => {
    InCallManager.startRingtone('_DEFAULT_', 0, 'default', ringtoneTime);
    pendingOffers.push({ callId, from, offerType });
    currentCallId = callId;
    router.push({
      pathname: "/screens/callScreens/incomingCall",
      params: { callId, from: newUser, to: from, conversationId: null },
    });
  });

  socket?.on("call:add-incoming-accepted", async ({ callId, from, newUser }) => {
    if (!from || !newUser || !currentCallId) return alert("Join/accept a call first, and enter new user id");
    const pc = await createPeerConnection(socket, myId, newUser);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket?.emit("call:add-offer", { callId: currentCallId, from, to: newUser, offer });
  });

  socket?.on("call:add-answer", async ({ callId, from, answer }) => {
    const ent = peerConnection[from];
    if (!ent || !ent.pc) {
      return;
    }
    try {
      await ent.pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (e) {
      console.info("Error setting add-answer remote desc", e);
    }
  });

  socket?.on("call:add-offer", async ({ callId, from, to, offer, offerType }) => {
    currentCallId = callId;
    const pc = await createPeerConnection(socket, myId, from);

    if (!localStream || localStream.getAudioTracks().length === 0) {
      try {
        const s = await mediaDevices.getUserMedia({ audio: true, video: false });
        localStream = s;
        s.getTracks().forEach(t => {
          try { pc.addTrack(t, s); } catch (err) { console.warn("Defensive addTrack error", err); }
        });
      } catch (err) {
        console.info("getUserMedia before add-offer answer failed", err);
        return;
      }
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    if (peerConnection[from].pendingCandidates.length) {
      for (const c of peerConnection[from].pendingCandidates) {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }
      peerConnection[from].pendingCandidates = [];
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket?.emit("call:add-answer", { callId, from: myId, to: from, answer });
  });

  socket?.on("call:existing-participants", async ({ callId, participants }) => {
    currentCallId = callId;
    for (const p of participants) {
      if (p === myId) continue;
      const pc = await createPeerConnection(socket, myId, p);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket?.emit("call:add-offer", { callId, from: myId, to: p, offer });
    }
  });

  socket?.on("call:new-participant", async ({ callId, userId, from }) => {
    await createPeerConnection(socket, myId, userId);
  });

};

// ────────────────────────────────────────────────────────────────
// INCOMMING CALL (CALLER SENDS CALL)
// ────────────────────────────────────────────────────────────────

export const handleAudioIncommingCall = async ({ callId, from, to, offer, offerType = "initial", conversationId: convId }: CallOfferPayload) => {
  pendingOffers.push({ callId, offer, from, offerType });
  currentCallId = callId;
  conversationId = convId;
  router.push({
    pathname: "/screens/callScreens/inCall",
    params: { callId, from, to, conversationId, callType: "incomingCall" },
  });
};

// ────────────────────────────────────────────────────────────────
// START CALL (CALLER SENDS OFFER)
// ────────────────────────────────────────────────────────────────

export const startCall = async (
  socket: Socket,
  myId: string,
  to: string,
  conversationId: string,
  notifyDbUpdate: any
): Promise<void> => {
  try {
    InCallManager.start({ media: 'audio', auto: true });
    InCallManager.setSpeakerphoneOn(true);
    speakerState = true;
  } catch (e) {
    console.warn('InCallManager start failed before startCall', e);
  }

  const pc = await createPeerConnection(socket, myId, to);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const tempCallId = Crypto.randomUUID()
  currentCallId = tempCallId;
  const socketData = {
    messageId: tempCallId,
    conversationId,
    senderId: myId,
    content: {
      status: 'ringing',
      callId: tempCallId,
      startedAt: new Date().toISOString(),
      to: Array.isArray(to) ? to : [to]
    },
    messageType: "audio_call",
    status: "delivered",
    timestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await saveMessage(socketData);
  await updateConversationLastMessage({
    id: conversationId,
    lastMessageId: socketData.messageId,
    lastMessage: "audio_call",
    lastMessageType: socketData.messageType,
    lastMessageSenderId: myId,
    lastMessageStatus: "delivered",
    lastMessageDate: new Date().toISOString(),
  }, myId);
  notifyDbUpdate();

  socket?.emit("chat:send-message", socketData);
  socket?.emit("call:offer", {
    callId: socketData.messageId,
    conversationId,
    from: myId,
    to,
    offer,
    timestamp: socketData.content.startedAt
  });

  router.push({
    pathname: "/screens/callScreens/inCall",
    params: { from: myId, to, conversationId },
  });
};

// ────────────────────────────────────────────────────────────────
// ACCEPT CALL (ANSWER SIDE)
// ────────────────────────────────────────────────────────────────

export const acceptCall = async (socket: Socket, myId: string): Promise<void> => {
  InCallManager.stopRingtone();
  if (pendingOffers.length < 1) return;

  for (const incoming of pendingOffers) {
    const { callId, offer, from, offerType } = incoming;
    if (!currentCallId) currentCallId = callId;
    if (offerType == "initial") {
      const pc = await createPeerConnection(socket, myId, from);

      if (!localStream || localStream.getTracks().length === 0) {
        try {
          const s = await mediaDevices.getUserMedia({ audio: true, video: false });
          localStream = s;
          s.getTracks().forEach(t => {
            try { pc.addTrack(t, s); } catch (err) { console.warn("Defensive addTrack error", err); }
          });
        } catch (err) {
          console.info("getUserMedia before answering failed", err);
          continue;
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer as any));

      // Apply queued ICE candidates now
      const ent = peerConnection[from];
      if (ent?.pendingCandidates?.length) {
        for (const c of ent.pendingCandidates) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          } catch (e) {
            console.warn("Error adding pending ICE candidate:", e);
          }
        }
        ent.pendingCandidates = [];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket?.emit("call:answer", { callId, from: myId, to: from, answer });
      socket?.emit("call:stopTimer", { callId });
      socket?.emit("call:connect", {
        from: myId,
        to: from,
        callId,
        conversationId,
        timestamp: new Date().toISOString()
      });
    }
    if (offerType == "addUser") {
      try {
        socket?.emit("call:add-user-accept", { callId, newUser: myId, from });
      } catch (err) {
        console.info("Error handling add-offer", err);
      }
    }
  }
  pendingOffers = [];
};

// ────────────────────────────────────────────────────────────────
// END CALL
// ────────────────────────────────────────────────────────────────

export const endCall = async (socket: Socket, from: string, conversationId: string): Promise<void> => {
  try {
    InCallManager.setSpeakerphoneOn(false);
    speakerState = false;
  } catch (e) { }
  await Promise.all(Object.keys(peerConnection).map(k => cleanupPeer(k)));
  socket?.emit("call:end", { from, callId: currentCallId, conversationId });
  (async () => {
    await updateAudioStatus({
      callId: currentCallId,
      status: "ended"
    });
  })()
  currentCallId = null;
  if (currentScreen === "screens/callScreens/inCall") {
    if (router.canDismiss()) router.dismiss();
  }
  try {
    InCallManager.setSpeakerphoneOn(false);
    speakerState = false;
  } catch (e) { }
};

// ────────────────────────────────────────────────────────────────
// ADD TO CALL
// ────────────────────────────────────────────────────────────────

export const addToCall = (socket: Socket, selectedUsers: any, from: string) => {
  const newUser = selectedUsers.map((usr: any) => usr.phone)
  socket?.emit("call:add-user", { callId: currentCallId, from, newUser });
}

// ────────────────────────────────────────────────────────────────
// Reset Data
// ────────────────────────────────────────────────────────────────

export const resetAllCallState = async () => {
  try {
    // Stop all peer connections
    await Promise.all(Object.keys(peerConnection).map(k => cleanupPeer(k)));

    peerConnection = {};
  } catch (err) {
    console.info("Error cleaning peers", err);
  }

  // Stop local stream
  try {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
  } catch (err) {
    console.info("Error stopping local stream", err);
  }

  // Stop InCallManager audio
  try {
    InCallManager.stopRingtone();
    InCallManager.setSpeakerphoneOn(false);
    speakerState = false;
  } catch (err) {
    console.info("InCallManager stop failed", err);
  }

  // Clear caches
  pendingOffers = [];
  currentCallId = null;
  conversationId = null;

  console.log("📌 WebRTC call state fully reset");
};