

//     // CHANGED: reads incoming call type + handles the switch-to-video renegotiation
//     socket?.on("video:offer", async ({ from, offer }) => {

import { currentScreen } from "@/app/_layout";
import { getIceServers } from "@/utils/turn";
import { updateConversationLastMessage } from "@/db/conversationRepo";
import { saveMessage } from "@/db/messageRepo";
import * as Crypto from 'expo-crypto';
import { router } from "expo-router";
import { Alert, DeviceEventEmitter } from "react-native";
import InCallManager from "react-native-incall-manager";
import {
    mediaDevices,
    MediaStream,
    RTCIceCandidate,
    RTCPeerConnection,
    RTCSessionDescription,
} from "react-native-webrtc";
import type { Socket } from "socket.io-client";

export interface IceCandidatePayload {
    callId: string;
    from: string;
    to?: string;
    candidate: RTCIceCandidateInit;
}

export const CallEvents = DeviceEventEmitter;

export interface PeerData {
    pc: RTCPeerConnection | null;
    pendingCandidates: RTCIceCandidateInit[];
    remoteStream: MediaStream | null;
    videoSender?: any;
    isOfferer?: boolean;   // the side that sent the offer also sends the ICE-restart offer
    restartTimer?: ReturnType<typeof setTimeout>;
    giveUpTimer?: ReturnType<typeof setTimeout>;
}

// Weak networks: modest camera size + bitrate cap. Frame rate is automatic: capture up to 30 fps and
// WebRTC lowers it (and the resolution) when the network is poor, raising it again when it improves.
const VIDEO_CONSTRAINTS = { facingMode: "user", width: 640, height: 360, frameRate: { ideal: 30, max: 30 } };
const MAX_VIDEO_BITRATE = 500_000;   // bps
const RESTART_AFTER_MS = 3000;
const GIVE_UP_AFTER_MS = 20000;

export let peerConnection: Record<string, PeerData> = {};
export let localStream: MediaStream | null = null;
let currentCallId: string | null = null;
let currentConversationId: string | null = null;
let currentCallType: "audio" | "video" = "video";

// ICE servers (Cloudflare TURN, short-lived credentials) come from auth-service: see utils/turn.ts
const pcConfig: RTCConfiguration = {
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceCandidatePoolSize: 10,
};

export const cleanupPeer = (remoteId: string) => {
    const peer = peerConnection[remoteId];
    if (!peer) return;

    clearTimeout(peer.restartTimer);
    clearTimeout(peer.giveUpTimer);
    try { peer.pc?.close(); } catch { }
    delete peerConnection[remoteId];
    CallEvents.emit("update-peers", peerConnection);

    if (Object.keys(peerConnection).length === 0) {
        localStream?.getTracks().forEach(t => t.stop());
        localStream = null;
        InCallManager.stop();
        router.dismiss();
    }
};

const ensureVideoTrack = async () => {
    if (!localStream) return null;

    let videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack && videoTrack.readyState === "live") {
        videoTrack.enabled = true;
        return videoTrack;
    }
    if (videoTrack) localStream.removeTrack(videoTrack);

    const videoStream = await mediaDevices.getUserMedia({
        video: VIDEO_CONSTRAINTS
    });
    videoTrack = videoStream.getVideoTracks()[0];
    localStream.addTrack(videoTrack);
    return videoTrack;
};

const capVideoBitrate = async (sender: any) => {
    try {
        const params = sender?.getParameters?.();
        if (!params?.encodings?.length) return;
        params.encodings.forEach((e: any) => { e.maxBitrate = MAX_VIDEO_BITRATE; });
        params.degradationPreference = "balanced";   // adapt frame rate and resolution together
        await sender.setParameters(params);
    } catch (e) {
        console.warn("Could not cap video bitrate", e);
    }
};

// ICE restart = a new offer on the existing connection (the other side answers as usual).
const restartIceFor = async (socket: Socket, myId: string, to: string) => {
    const peer = peerConnection[to];
    if (!peer?.pc || !peer.isOfferer) return;   // only one side restarts
    try {
        console.log(`Restarting ICE for ${to}`);
        const offer = await peer.pc.createOffer({ iceRestart: true } as any);
        await peer.pc.setLocalDescription(offer);
        socket?.emit("video:offer", { from: myId, to, offer, callId: currentCallId, currentCallType });
    } catch (e) {
        console.warn("ICE restart failed", e);
    }
};

export const createPeer = async (
    socket: Socket,
    myId: string,
    to: string,
    callType: "audio" | "video" = "video"
): Promise<RTCPeerConnection> => {
    if (peerConnection[to]?.pc) {
        const state = peerConnection[to].pc.connectionState;
        // A "failed" peer may be reconnecting (ICE restart offer), so keep it.
        if (state !== "closed") {
            console.info(`Reusing existing peer for ${to}`);
            return peerConnection[to].pc;
        }
    }

    console.info(`Creating NEW peer for ${to}`);

    if (peerConnection[to]?.pc) {
        try {
            peerConnection[to].pc.close();
        } catch (_) { }
        delete peerConnection[to];
    }

    if (!localStream) {
        localStream = await mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } as any,
            video: callType === "video" ? VIDEO_CONSTRAINTS : false,
        });
    }

    localStream.getVideoTracks().forEach(t => {
        t.enabled = callType === "video";
    });

    try {
        InCallManager.start({ media: callType, auto: true });
        InCallManager.setSpeakerphoneOn(true);
    } catch (e) {
        console.warn('InCallManager start failed in createPeerConnection', e);
    }

    // Relay through TURN when we have credentials; plain STUN only if the TURN fetch failed

    const { iceServers, hasTurn } = await getIceServers();

    const pc = new RTCPeerConnection({ ...pcConfig, iceServers, iceTransportPolicy: hasTurn ? "relay" : "all" });

    peerConnection[to] = {
        pc,
        pendingCandidates: [],
        remoteStream: null,
        videoSender: null,
    };

    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) pc.addTrack(audioTrack, localStream!);

    const videoTrack = localStream.getVideoTracks()[0];
    if (callType === "video" && videoTrack) {
        peerConnection[to].videoSender = pc.addTrack(videoTrack, localStream!);
    } else {
        const tx = pc.addTransceiver("video", { direction: "sendrecv" });
        peerConnection[to].videoSender = tx.sender;
    }
    await capVideoBitrate(peerConnection[to].videoSender);

    (pc as any).onicecandidate = (event: any) => {
        if (!event.candidate) return;
        const payload: IceCandidatePayload = {
            callId: currentCallId!,
            from: myId,
            to,
            candidate: event.candidate.toJSON()
        };
        socket?.emit("video:ice-candidate", payload);
    };

    (pc as any).ontrack = (event: any) => {
        const remoteStream = event.streams?.[0];
        if (!remoteStream) return;
        peerConnection[to].remoteStream = remoteStream;
        CallEvents.emit("update-peers", { ...peerConnection });
    };

    (pc as any).onconnectionstatechange = () => {
        console.log(`Connection state for ${to}:`, pc.connectionState);
        // "failed" is handled below (reconnect first); only a closed connection ends the call here.
        if (pc.connectionState === "closed") {
            cleanupPeer(to);
        }
        CallEvents.emit("update-peers", peerConnection);
    };

    (pc as any).oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`ICE state for ${to}:`, state);
        const peer = peerConnection[to];
        if (!peer || peer.pc !== pc) return;
        const isUp = () => pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed";

        if (isUp()) {
            clearTimeout(peer.restartTimer);
            clearTimeout(peer.giveUpTimer);
            peer.restartTimer = peer.giveUpTimer = undefined;
            return;
        }
        if (state === "disconnected" || state === "failed") {
            if (!peer.restartTimer) {
                peer.restartTimer = setTimeout(() => {
                    peer.restartTimer = undefined;
                    if (!isUp()) restartIceFor(socket, myId, to);
                }, state === "failed" ? 0 : RESTART_AFTER_MS);
            }
            if (!peer.giveUpTimer) {
                peer.giveUpTimer = setTimeout(() => {
                    peer.giveUpTimer = undefined;
                    if (!isUp()) cleanupPeer(to);
                }, GIVE_UP_AFTER_MS);
            }
        }
    };

    return pc;
};

export const registerVideoCallHandlers = (socket: Socket, myId: string) => {
    const VIDEO_CALL_SOCKET_EVENTS = [
        "video:call-started",
        "video:call-details",
        "video:call-accepted",
        "video:missed-call",
        "video:user-joined",
        "video:offer",
        "video:answer",
        "video:ice-candidate",
        "video:user-remove",
        "video:clear-call",
        "video:end-call",
        "video:call-type-changed",
    ];
    VIDEO_CALL_SOCKET_EVENTS.forEach((sock) => {
        socket?.off(sock);
    });

    socket?.on("video:call-started", async ({ callId, from, callType }) => {
        currentCallId = callId;
        currentCallType = callType ?? "video";
        const pc = await createPeer(socket, myId, from, currentCallType);
        peerConnection[from].isOfferer = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit("video:offer", { from: myId, to: from, offer, callId, currentCallType });
    });

    socket?.on("video:call-details", ({ callId }) => {
        currentCallId = callId;
    });

    socket?.on("video:call-accepted", () => {
        // show in-call UI
    });

    socket?.on("video:missed-call", async ({ from, callId }) => {
        if (currentScreen === "screens/callScreens/videoInCall") {
            router.dismiss();
        }
    });

    socket?.on("video:user-joined", async ({ username }) => {
        const pc = await createPeer(socket, myId, username, currentCallType);
        peerConnection[username].isOfferer = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        // carry the call type so the joiner captures the right media
        socket?.emit("video:offer", { from: myId, to: username, offer, currentCallType });
    });

    socket?.on("video:offer", async ({ from, offer }) => {
        const pc = await createPeer(socket, myId, from, currentCallType);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const peer = peerConnection[from];
        if (peer && peer.pendingCandidates.length > 0) {
            for (const candidate of peer.pendingCandidates) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.warn("Error adding pending candidate:", e);
                }
            }
            peer.pendingCandidates = [];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket?.emit("video:answer", { from: myId, to: from, answer, callId: currentCallId });
    });

    socket?.on("video:answer", async ({ from, answer }) => {
        const ent = peerConnection[from];
        if (!ent || !ent.pc) return;

        await ent.pc.setRemoteDescription(new RTCSessionDescription(answer as any));
        ent.pendingCandidates.forEach(c =>
            ent.pc?.addIceCandidate(new RTCIceCandidate(c))
        );
        ent.pendingCandidates = [];
    });

    socket?.on("video:ice-candidate", async ({ from, candidate }) => {
        const peer = peerConnection[from];
        if (!peer) return;
        if (!peer.pc?.remoteDescription) {
            peer.pendingCandidates.push(candidate);
            return;
        }
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket?.on("video:user-remove", ({ username }) => {
        cleanupPeer(username);
    });

    socket?.on("video:clear-call", ({ from, username }) => {
        if (from == username) {
            socket?.emit("video:end-call", { callId: currentCallId, from, conversationId: currentConversationId, timestamp: Date.now() });
        }
        currentCallId = null;
        Object.keys(peerConnection).forEach((username: string) => cleanupPeer(username));
        if (currentScreen === "screens/callScreens/videoInCall" && Object.keys(peerConnection).length == 1) {
            if (router.canGoBack()) {
                router.dismiss();
            }
        }
    });

    socket?.on("video:call-rejected", ({ callId, from }) => {
        if (currentScreen === "screens/callScreens/videoInCall") {
            router.dismiss();
        }
    });

    // The person we called is already on another call
    socket?.on("video:InCall", () => {
        Object.keys(peerConnection).forEach((u: string) => cleanupPeer(u));
        peerConnection = {};
        if (currentScreen === "screens/callScreens/videoInCall" && router.canDismiss()) router.dismiss();
        Alert.alert("User is busy", "They're on another call. Try again later.");
    });

    socket?.on("video:call-type-changed", async ({ from, type }) => {
        currentCallType = type;

        if (type === "video") {
            const videoTrack = await ensureVideoTrack();
            if (videoTrack) await peerConnection[from]?.videoSender?.replaceTrack(videoTrack);
            InCallManager.setSpeakerphoneOn(true);
        } else {
            await peerConnection[from]?.videoSender?.replaceTrack(null);
            localStream?.getVideoTracks().forEach(t => t.stop());
            InCallManager.setSpeakerphoneOn(false);
        }

        CallEvents.emit("call-type-changed", type);
    });
};

export const leaveVideoCall = (socket: Socket, myId: string, conversationIdTemp: string) => {
    Object.keys(peerConnection).forEach((username: string) => cleanupPeer(username));
    socket?.emit("video:remove-user", { callId: currentCallId, username: myId, conversationId: currentConversationId });
    currentCallId = conversationIdTemp;
    peerConnection = {};
    if (currentScreen === "screens/callScreens/videoInCall") {
        router.dismiss();
    }
};

export const rejectVideoCall = (socket: Socket, myId: string, to: string) => {
    socket?.emit("video:reject-call", { callId: currentCallId, from: myId, to });
    currentCallId = null;
    peerConnection = {};
    router.dismiss();
};

export const addUserVideoCall = (socket: Socket, myId: string, to: any[], callType: string) => {
    for (let user of to) {
        socket?.emit("video:add-user", { callId: currentCallId, from: myId, username: user?.phone, callType });
    }
};

export const startVideoCall = async (socket: Socket, from: string, to: string, conversationId: string, notifyDbUpdate: any, callType: "audio" | "video" = "video", switchToVideo: boolean = false) => {
    if (!from || !to) return;

    currentCallType = callType;

    if (!localStream) {
        localStream = await mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } as any,
            video: callType === "video" ? VIDEO_CONSTRAINTS : false,
        });
    }

    localStream.getVideoTracks().forEach(t => { t.enabled = callType === "video"; });

    try {
        InCallManager.start({ media: callType, auto: true });
        InCallManager.setSpeakerphoneOn(true);
    } catch (e) {
        console.warn('InCallManager start failed before startCall', e);
    }

    const tempCallId = Crypto.randomUUID();
    currentCallId = tempCallId;
    currentConversationId = conversationId;
    const socketData = {
        messageId: tempCallId,
        conversationId,
        senderId: from,
        content: {
            status: 'ringing',
            callId: tempCallId,
            startedAt: new Date().toISOString(),
            to: Array.isArray(to) ? to : [to]
        },
        messageType: callType === "audio" ? "audio_call" : "video_call",
        status: "delivered",
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }
    await saveMessage(socketData);
    await updateConversationLastMessage({
        id: conversationId,
        lastMessageId: socketData.messageId,
        lastMessage: "video_call",
        lastMessageType: socketData.messageType,
        lastMessageSenderId: from,
        lastMessageStatus: "delivered",
        lastMessageDate: new Date().toISOString(),
    }, from);
    notifyDbUpdate();
    currentCallId = tempCallId;
    socket?.emit("chat:send-message", socketData);
    socket?.emit("video:start-call", { callId: tempCallId, from, to, conversationId, switchToVideo, callType });

    router.push({
        pathname: "/screens/callScreens/videoInCall",
        params: { from: from, to, conversationId, callType },
    });
};

export const acceptVideoCall = async (socket: Socket, from: string, to: string, conversationId: string, callId?: string, offerType?: string, callType: "audio" | "video" = currentCallType) => {
    if (!from || !to) return;
    currentCallId = callId || currentCallId;
    currentConversationId = conversationId;
    currentCallType = callType;
    try {
        InCallManager.start({ media: callType, auto: true });
        InCallManager.setSpeakerphoneOn(true);
    } catch (e) {
        console.warn('InCallManager start failed before startCall', e);
    }

    if (offerType == "addUser") {
        socket?.emit("video:add-user-accept", { callId: currentCallId, username: to });
    }
    else {
        socket?.emit("video:accept-call", { callId: currentCallId, from: to, to: from });
    }

    router.push({
        pathname: "/screens/callScreens/videoInCall",
        params: { from, to, conversationId, callType },
    });
};

export const handleIncommingVideoCall = async ({ socket, callId, from, to, conversationId, callType }: any) => {
    currentCallId = callId;
    currentConversationId = conversationId;

    await acceptVideoCall(socket, from, to, conversationId, callId, undefined, callType ?? currentCallType);
};

export const switchCamera = async () => {
    if (!localStream) return;

    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const settings = videoTrack.getSettings();
    const newFacingMode = settings.facingMode === "user" ? "environment" : "user";

    await videoTrack.applyConstraints({
        facingMode: newFacingMode
    });
};

export const switchCallType = async (socket: Socket, myId: string, newCallType: "audio" | "video") => {
    console.log(currentCallType, newCallType);
    currentCallType = newCallType;

    if (newCallType === "video") {
        const videoTrack = await ensureVideoTrack();
        if (videoTrack) {
            for (const to of Object.keys(peerConnection)) {
                await peerConnection[to]?.videoSender?.replaceTrack(videoTrack);
            }
        }
    } else {
        for (const to of Object.keys(peerConnection)) {
            await peerConnection[to]?.videoSender?.replaceTrack(null);
        }
        localStream?.getVideoTracks().forEach(t => t.stop());
    }

    InCallManager.setSpeakerphoneOn(newCallType === "video");

    Object.keys(peerConnection).forEach((to) => {
        socket?.emit("video:call-type-changed", {
            from: myId, to, callId: currentCallId, conversationId: currentConversationId, type: newCallType,
        });
    });

    CallEvents.emit("call-type-changed", newCallType);
};