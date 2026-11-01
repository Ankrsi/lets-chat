import { currentScreen } from "@/app/_layout";
import { stopRinging } from "@/utils/incomingCall";
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
    qualityTimer?: ReturnType<typeof setInterval>;
    quality?: Quality;
}

// Weak networks: modest camera size + bitrate cap. Frame rate is automatic: capture up to 30 fps and
// WebRTC lowers it (and the resolution) when the network is poor, raising it again when it improves.
const VIDEO_CONSTRAINTS = { facingMode: "user", width: 640, height: 360, frameRate: { ideal: 30, max: 30 } };
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

const closePeer = (peer: PeerData) => {
    clearTimeout(peer.restartTimer);
    clearTimeout(peer.giveUpTimer);
    clearInterval(peer.qualityTimer);
    try { peer.pc?.close(); } catch { }
};

// Ends the call on this phone, however it ended (hang up, declined, missed, busy, dropped):
// closes the connections, turns off camera and mic, gives the phone's audio back (no more call
// mode, speaker or mic icon) and closes the call screen once.
const endCallHere = () => {
    const peers = Object.values(peerConnection);
    peerConnection = {}; // first, so the "closed" events below find nothing left to clean
    peers.forEach(closePeer);
    localStream?.getTracks().forEach(t => t.stop());
    localStream = null;
    micMuted = false;
    cameraOff = false;
    currentCallId = null;
    InCallManager.stop(); // back to normal phone audio (also unmutes the mic and releases the speaker)
    CallEvents.emit("update-peers", peerConnection);
    if (currentScreen === "screens/callScreens/videoInCall" && router.canDismiss()) router.dismiss();
};

// One person left (or their connection dropped). The last one leaving ends the call.
export const cleanupPeer = (remoteId: string) => {
    const peer = peerConnection[remoteId];
    if (!peer) return;
    delete peerConnection[remoteId];
    closePeer(peer);
    CallEvents.emit("update-peers", peerConnection);
    if (Object.keys(peerConnection).length === 0) endCallHere();
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

// Video quality levels, picked from the connection (see watchQuality). WebRTC also adapts by itself
// within each level; the levels keep weak networks from freezing and let good ones look sharper.
const QUALITY = {
    high: { maxBitrate: 900_000, scaleResolutionDownBy: 1, maxFramerate: 30 },     // full 640x360
    medium: { maxBitrate: 450_000, scaleResolutionDownBy: 1.5, maxFramerate: 24 },
    low: { maxBitrate: 150_000, scaleResolutionDownBy: 3, maxFramerate: 15 },
};
export type Quality = keyof typeof QUALITY;

const applyQuality = async (sender: any, level: Quality) => {
    try {
        const params = sender?.getParameters?.();
        if (!params?.encodings?.length) return;
        params.encodings.forEach((e: any) => Object.assign(e, QUALITY[level]));
        params.degradationPreference = "balanced";   // adapt frame rate and resolution together
        await sender.setParameters(params);
    } catch (e) {
        console.warn("Could not set video quality", e);
    }
};

// Start in the middle; watchQuality moves up or down once the call is connected
const capVideoBitrate = (sender: any) => applyQuality(sender, "medium");

// Every few seconds: how fast can we send, how much is lost, how long is the round trip.
// A level only changes after two checks in a row agree, so the picture doesn't flicker.
const QUALITY_CHECK_MS = 3000;
const pickQuality = (kbps: number, loss: number, rttSec: number): Quality =>
    kbps >= 800 && loss < 0.03 && rttSec < 0.3 ? "high"
        : kbps >= 300 && loss < 0.1 && rttSec < 0.6 ? "medium"
            : "low";

const watchQuality = (remoteId: string) => {
    const peer = peerConnection[remoteId];
    if (!peer || peer.qualityTimer) return;
    let pending: Quality | null = null;
    peer.qualityTimer = setInterval(async () => {
        const current = peerConnection[remoteId];
        if (!current?.pc || current !== peer) return;
        try {
            let kbps = 0, loss = 0, rtt = 0;
            const report: any = await current.pc.getStats();
            report.forEach((r: any) => {
                if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated) {
                    kbps = (r.availableOutgoingBitrate ?? 0) / 1000;
                    rtt = r.currentRoundTripTime ?? 0;
                }
                if (r.type === "remote-inbound-rtp" && r.kind === "video") loss = r.fractionLost ?? 0;
            });
            if (!kbps) return; // no estimate yet
            const level = pickQuality(kbps, loss, rtt);
            if (level === current.quality) { pending = null; return; }
            if (pending !== level) { pending = level; return; } // wait for a second check
            pending = null;
            current.quality = level;
            await applyQuality(current.videoSender, level);
            CallEvents.emit("network-quality", level);
        } catch (e) {
            console.info("quality check failed", e);
        }
    }, QUALITY_CHECK_MS);
};

// Answering an audio call: our own empty video slot isn't part of the caller's offer, so a camera put
// into it later is never sent. Use the offer's video slot instead (set to send too), so switching the
// call to video works without a new offer. In video calls this is already the same slot.
const useOfferedVideoSlot = (peer: PeerData) => {
    const slot = peer.pc?.getTransceivers().find((t: any) => t.mid != null && t.receiver?.track?.kind === "video");
    if (!slot || slot.sender === peer.videoSender) return;
    if (!slot.sender.track) slot.direction = "sendrecv";
    peer.videoSender = slot.sender;
    capVideoBitrate(slot.sender);
};

// This person's connection is already set up (or being set up from their side)
const alreadyConnected = (remoteId: string) => !!peerConnection[remoteId]?.pc?.remoteDescription;

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
        InCallManager.setForceSpeakerphoneOn(callType === "video"); // video: loudspeaker, audio: earpiece
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
        const peer = peerConnection[to];
        if (!peer) return;
        // Our own stream with every track received so far. A track can arrive without a stream (the video
        // slot of an audio call), and tracks added to the received stream don't reach the video view on
        // Android, so the screen stayed black. A new stream also makes the view redraw (new id).
        const others = (peer.remoteStream?.getTracks() ?? []).filter((t: any) => t.id !== event.track.id);
        peer.remoteStream = new MediaStream([...others, event.track]);
        CallEvents.emit("update-peers", { ...peerConnection });
    };

    (pc as any).onconnectionstatechange = () => {
        console.log(`Connection state for ${to}:`, pc.connectionState);
        // "failed" is handled below (reconnect first); only a closed connection ends the call here.
        if (pc.connectionState === "closed") {
            cleanupPeer(to);
        }
        if (pc.connectionState === "connected") watchQuality(to);
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
        "video:call-rejected",
        "video:InCall",
        "video:cameraState",
    ];
    VIDEO_CALL_SOCKET_EVENTS.forEach((sock) => {
        socket?.off(sock);
    });

    socket?.on("video:call-started", async ({ callId, from, callType }) => {
        currentCallId = callId;
        currentCallType = callType ?? "video";
        if (alreadyConnected(from)) return; // a repeated "accepted": the call is already set up
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

    socket?.on("video:missed-call", async ({ callId }) => {
        stopRinging(callId);
        if (callId === currentCallId) endCallHere(); // our outgoing call wasn't answered
    });

    socket?.on("video:user-joined", async ({ username }) => {
        if (alreadyConnected(username)) return;
        const pc = await createPeer(socket, myId, username, currentCallType);
        peerConnection[username].isOfferer = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        // carry the call type so the joiner captures the right media
        socket?.emit("video:offer", { from: myId, to: username, offer, currentCallType });
    });

    socket?.on("video:offer", async ({ from, offer }) => {
        const pc = await createPeer(socket, myId, from, currentCallType);
        // Both sides sent an offer at the same moment ("glare"). Only one may win, decided the same
        // way on both phones: the larger number keeps its offer; the smaller one drops its own
        // (setRemoteDescription does that by itself) and answers.
        if (pc.signalingState === "have-local-offer" && String(myId) > String(from)) return;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const peer = peerConnection[from];
        if (peer) useOfferedVideoSlot(peer);
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
        // An answer only fits while our offer is waiting; a late one (after glare) is ignored
        if (ent.pc.signalingState !== "have-local-offer") return;

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

    socket?.on("video:clear-call", ({ from, username, callId }) => {
        stopRinging(callId); // the caller hung up while it was still ringing here
        if (from == username) {
            socket?.emit("video:end-call", { callId: callId || currentCallId, from, conversationId: currentConversationId, timestamp: Date.now() });
        }
        endCallHere();
    });

    socket?.on("video:call-rejected", () => endCallHere());

    // The person we called is already on another call
    // Someone in the call turned their camera off/on (we get our own too: ignored)
    socket?.on("video:cameraState", ({ username, off }) => {
        if (String(username) !== String(myId)) CallEvents.emit("camera-state", { username: String(username), off: !!off });
    });

    socket?.on("video:InCall", () => {
        endCallHere();
        Alert.alert("User is busy", "They're on another call. Try again later.");
    });

    socket?.on("video:call-type-changed", async ({ from, type }) => {
        currentCallType = type;

        if (type === "video") {
            const videoTrack = await ensureVideoTrack();
            if (videoTrack) await peerConnection[from]?.videoSender?.replaceTrack(videoTrack);
            InCallManager.setForceSpeakerphoneOn(true);
        } else {
            await peerConnection[from]?.videoSender?.replaceTrack(null);
            localStream?.getVideoTracks().forEach(t => t.stop());
            InCallManager.setForceSpeakerphoneOn(false);
        }

        CallEvents.emit("call-type-changed", type);
    });
};

// End button
export const leaveVideoCall = (socket: Socket, myId: string) => {
    socket?.emit("video:remove-user", { callId: currentCallId, username: myId, conversationId: currentConversationId });
    endCallHere();
};

// Decline from the ringing notification: we never joined, so there's nothing here to end
export const rejectVideoCall = (socket: Socket, myId: string, to: string, callId?: string) => {
    socket?.emit("video:reject-call", { callId: callId || currentCallId, from: myId, to });
};

export const addUserVideoCall = (socket: Socket, myId: string, to: any[], callType: string) => {
    for (let user of to) {
        socket?.emit("video:add-user", { callId: currentCallId, from: myId, username: user?.phone, callType });
    }
};

export const startVideoCall = async (socket: Socket, from: string, to: string, conversationId: string, notifyDbUpdate: any, callType: "audio" | "video" = "video") => {
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
        InCallManager.setForceSpeakerphoneOn(callType === "video");
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
    socket?.emit("video:start-call", { callId: tempCallId, from, to, conversationId, callType });

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
        InCallManager.setForceSpeakerphoneOn(callType === "video");
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

// Mute button (1:1). Returns true when now muted, like the group version.
// Camera off/on during a video call: the call stays a video call, only my picture stops.
// The other side is told so it shows my avatar instead of black video. Returns true when now off.
let cameraOff = false;
export const toggleCamera = (socket: Socket, myId: string): boolean => {
    cameraOff = !cameraOff;
    localStream?.getVideoTracks().forEach((t) => { t.enabled = !cameraOff; });
    socket?.emit("video:cameraState", { callId: currentCallId, username: myId, off: cameraOff });
    return cameraOff;
};

// Mutes both the call's mic track and the phone's microphone, so it works even if the track changes.
let micMuted = false;
export const toggleMute = (): boolean => {
    micMuted = !micMuted;
    localStream?.getAudioTracks().forEach((t) => { t.enabled = !micMuted; });
    InCallManager.setMicrophoneMute(micMuted);
    return micMuted;
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

    InCallManager.setForceSpeakerphoneOn(newCallType === "video");

    Object.keys(peerConnection).forEach((to) => {
        socket?.emit("video:call-type-changed", {
            from: myId, to, callId: currentCallId, conversationId: currentConversationId, type: newCallType,
        });
    });

    CallEvents.emit("call-type-changed", newCallType);
};