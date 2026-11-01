import BottomSheet from "@/app/components/BottomSheet";
import UserVideoCallBox from "@/app/components/UserVideoCallBox";
import { styles as appStyles } from "@/app/styles";
import { ContactContext } from "@/contexts/FriendContactContext";
import {
  endVideoGroupCall,
  getVideoGroupConsumers,
  groupVideoLocalStream,
  VideoCallEvents,
  videoGroupCallConsumers,
  videoToggleAudio,
  videoToggleCamera,
  switchCallType as switchGroupCallType,
} from "@/contexts/groupVideoCallService";
import {
  addUserVideoCall,
  CallEvents,
  leaveVideoCall,
  localStream,
  peerConnection,
  switchCallType,
  toggleCamera,
  toggleMute,
} from "@/contexts/videoCallController";
import { colors } from "@/theme";
import { changeCallType, getActiveCall, updateCallControls, useActiveCall } from "@/utils/activeCall";
import { getGlobalSocket, getGlobalUsername } from "@/utils/globalRefs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import ExpoPip from "expo-pip";
import { router, useLocalSearchParams } from "expo-router";
import React, { useContext, useEffect, useRef, useState } from "react";
import { Animated, FlatList, Image, StatusBar, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import InCallManager from "react-native-incall-manager";
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RTCView } from "react-native-webrtc";

const BG = "#0B1220";
const SELF_W = 110;
const SELF_H = 160;
const SELF_RADIUS = 16;
const EDGE = 16;
// Small floating window (picture-in-picture) in portrait, like the call itself
const PIP_SIZE = { width: 9, height: 16 };

// My camera in a small box: drag it anywhere, it snaps to the nearest corner. Tap flips the camera.
function DraggableSelfView({ top, bottom, onTap, children }: { top: number; bottom: number; onTap: () => void; children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const minX = EDGE, maxX = width - SELF_W - EDGE;
  const minY = top, maxY = height - SELF_H - bottom;
  const x = useSharedValue(maxX);
  const y = useSharedValue(minY);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      x.value = Math.min(maxX, Math.max(minX, startX.value + e.translationX));
      y.value = Math.min(maxY, Math.max(minY, startY.value + e.translationY));
    })
    .onEnd(() => {
      x.value = withSpring(x.value < (minX + maxX) / 2 ? minX : maxX, { damping: 18 });
      y.value = withSpring(y.value < (minY + maxY) / 2 ? minY : maxY, { damping: 18 });
    });
  const tap = Gesture.Tap().onEnd(() => runOnJS(onTap)());

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Reanimated.View style={[s.selfView, style]}>{children}</Reanimated.View>
    </GestureDetector>
  );
}

const formatTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Photo, or the first letters of the name on a coloured circle
function Avatar({ name, photo, size }: { name: string; photo?: string | null; size: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return photo ? (
    <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={[s.initials, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[s.initialsText, { fontSize: size * 0.36 }]}>{initials || "?"}</Text>
    </View>
  );
}

// Soft ring that pulses around the avatar while the call isn't connected yet
function Pulse({ active, size }: { active: boolean; size: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.timing(anim, { toValue: 1, duration: 1600, useNativeDriver: true }));
    loop.start();
    return () => { loop.stop(); anim.setValue(0); };
  }, [active]);
  if (!active) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[s.pulse, {
        width: size, height: size, borderRadius: size / 2,
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
      }]}
    />
  );
}

// Round button with a small label under it. `on` = highlighted (e.g. muted, speaker on).
function CallButton({ icon, label, onPress, on, danger }: { icon: any; label: string; onPress: () => void; on?: boolean; danger?: boolean }) {
  return (
    <TouchableOpacity style={s.btnWrap} onPress={onPress} activeOpacity={0.75} accessibilityLabel={label}>
      <View style={[s.btn, on && s.btnOn, danger && s.btnDanger]}>
        <MaterialCommunityIcons name={icon} size={26} color={on ? BG : "#FFFFFF"} />
      </View>
      <Text style={s.btnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function videoInCall() {
  const socket = getGlobalSocket();
  const username = getGlobalUsername();
  const insets = useSafeAreaInsets();
  const { callType, to, from } = useLocalSearchParams();
  const { viewName } = useContext(ContactContext) ?? {};
  const [openContact, setOpenContact] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  // Video calls start on the loudspeaker, audio calls on the earpiece (set by the call controllers)
  // Opened again after leaving it: buttons show how they were left, not their defaults
  const saved = getActiveCall();
  const call = useActiveCall();
  const connectedAt = call?.connectedAt ?? null;
  const [isSpeakerOn, setIsSpeakerOn] = useState(saved?.speaker ?? callType !== "audio");
  const { isInPipMode } = ExpoPip.useIsInPip();
  const pipSupported = ExpoPip.isInPipMode() !== undefined; // undefined: this build has no picture-in-picture
  const [muted, setMuted] = useState(saved?.muted ?? false);
  const [cameraOff, setCameraOff] = useState(saved?.cameraOff ?? false); // my camera
  const [peerCameraOff, setPeerCameraOff] = useState(false); // the other person's camera (1:1)
  const [poorNetwork, setPoorNetwork] = useState(false); // video quality dropped to "low"
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
  const [consumers, setConsumers] = useState<any[]>([]);
  const [speakingUsers, setSpeakingUsers] = useState<any[]>([]);
  const [mutedUsers, setMutedUsers] = useState<Record<string, boolean>>({});

  const isGroup = callType === "groupCall";

  // Starts from the route param, then follows audio <-> video switches (either side)
  const [activeCallType, setActiveCallType] = useState<"audio" | "video">(
    callType === "audio" ? "audio" : "video"
  );
  const isAudio = activeCallType === "audio";

  // The other person: the caller opens this with to = them, the answering side with from = them
  const other = String(from) === String(username) ? String(to) : String(from);
  const contact = viewName?.get(other);
  const title = isGroup ? "Group call" : contact?.name || contact?.full_name || other;

  useEffect(() => {
    setConsumers(getVideoGroupConsumers());
    const s1 = VideoCallEvents.addListener("group-video-speaking-changed", setSpeakingUsers);
    const s2 = VideoCallEvents.addListener("group-video-mute-changed",
      ({ userId, muted }: { userId: string; muted: boolean }) => setMutedUsers((prev) => ({ ...prev, [userId]: muted })),
    );
    // The other side switched audio <-> video: the speaker follows (video: on, audio: off)
    const followType = (type: "audio" | "video") => {
      setActiveCallType(type);
      setIsSpeakerOn(type === "video");
    };
    const s3 = CallEvents.addListener("call-type-changed", followType);
    const s5 = CallEvents.addListener("camera-state", ({ off }: { off: boolean }) => setPeerCameraOff(off));
    const s6 = CallEvents.addListener("network-quality", (level: string) => setPoorNetwork(level === "low"));
    const s4 = VideoCallEvents.addListener("group-video-calltype-changed",
      ({ callType: nextType }: { callType: "audio" | "video" }) => followType(nextType),
    );
    AsyncStorage.getItem("contactsFriend").then((raw) => setContacts(JSON.parse(raw || "[]")));

    // Call state lives in the controllers: read it a few times a second
    const interval = setInterval(() => {
      if (isGroup) {
        setConsumers([...videoGroupCallConsumers]);
        return;
      }
      const peers = Object.values(peerConnection);
      setRemoteStreams(peers.map((peer: any) => peer.remoteStream).filter(Boolean));
      // Truly connected (media flowing), not just "the other side's offer/answer arrived"
      setConnected(peers.some((peer: any) => peer.pc?.connectionState === "connected"));
    }, 400);

    return () => {
      clearInterval(interval);
      s1.remove();
      s2.remove();
      s3.remove();
      s4.remove();
      s5.remove();
      s6.remove();
    };
  }, []);

  const live = isGroup ? consumers.length > 0 : connected;

  // Remember the buttons, so they look the same when this screen is opened again
  useEffect(() => {
    updateCallControls({ muted, cameraOff, speaker: isSpeakerOn });
  }, [muted, cameraOff, isSpeakerOn]);
  useEffect(() => {
    changeCallType(activeCallType);
  }, [activeCallType]);

  const status = live && connectedAt
    ? formatTime(Date.now() - connectedAt)
    : !isGroup && remoteStreams.length > 0 ? "Connecting…" : "Calling…";

  const endCall = () => {
    if (isGroup) endVideoGroupCall(socket!, username!);
    else leaveVideoCall(socket!, username!);
  };

  const toggleMic = () => setMuted(isGroup ? videoToggleAudio() : toggleMute());

  // Camera off keeps the video call going (switching to a voice call is the Video button in voice calls)
  const toggleCam = () => setCameraOff(isGroup ? videoToggleCamera() : toggleCamera(socket!, username!));

  const handleSwitchCallType = () => {
    const next = isAudio ? "video" : "audio";
    if (isGroup) switchGroupCallType(socket!, username!, next);
    else switchCallType(socket!, username!, next);
    InCallManager.setForceSpeakerphoneOn(next === "video");
    setIsSpeakerOn(next === "video");
  };

  // Leaving the app during a video call shrinks it into a small floating window (Android 12+);
  // turned off again for audio and when the call ends, so the app never shrinks outside a call
  useEffect(() => {
    ExpoPip.setPictureInPictureParams({ ...PIP_SIZE, autoEnterEnabled: !isAudio, seamlessResizeEnabled: false });
  }, [isAudio]);
  useEffect(() => () => ExpoPip.setPictureInPictureParams({ autoEnterEnabled: false }), []);

  const toggleSpeaker = () => {
    InCallManager.setForceSpeakerphoneOn(!isSpeakerOn);
    setIsSpeakerOn(!isSpeakerOn);
  };

  const flipCamera = () => {
    const track: any = (isGroup ? groupVideoLocalStream : localStream)?.getVideoTracks()[0];
    track?._switchCamera?.();
  };

  const toggleSelectUser = (user: any) => {
    setSelectedUsers((prev) =>
      prev.some((u) => u.phone === user.phone) ? prev.filter((u) => u.phone !== user.phone) : [...prev, user],
    );
  };

  const addToCall = () => {
    addUserVideoCall(socket!, username!, selectedUsers, activeCallType);
    setSelectedUsers([]);
    setOpenContact(false);
  };

  const myVideo = isGroup ? groupVideoLocalStream : localStream;
  const remoteVideos = remoteStreams.filter((st: any) => st.getVideoTracks?.().length);
  // Their camera off: show their picture instead of black video
  const showRemoteVideo = !isGroup && !isAudio && remoteVideos.length > 0 && !peerCameraOff;

  // Small floating window: only the other person's video (or their picture), no buttons
  if (isInPipMode) {
    return (
      <View style={s.container}>
        {showRemoteVideo
          ? <RTCView streamURL={remoteVideos[0].toURL()} style={{ flex: 1 }} objectFit="cover" zOrder={0} />
          : <View style={s.center}><Avatar name={title} photo={contact?.profile_image} size={64} /></View>}
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* The other person's video, full screen (two or more stack up) */}
      {showRemoteVideo && (
        <View style={StyleSheet.absoluteFill}>
          {remoteVideos.map((stream: any) => (
            <RTCView key={stream.id} streamURL={stream.toURL()} style={{ flex: 1 }} objectFit="cover" zOrder={0} />
          ))}
        </View>
      )}

      {/* Group: everyone's tiles */}
      {isGroup && consumers.length > 0 && (
        <View style={[StyleSheet.absoluteFill, { paddingTop: insets.top + 90, paddingBottom: insets.bottom + 140 }]}>
          <UserVideoCallBox
            users={consumers.map((stream: any) => ({ name: viewName?.get(stream.userId)?.name || stream.userId, stream }))}
            speakingUsers={speakingUsers}
            mutedUsers={mutedUsers}
            isAudio={isAudio}
          />
        </View>
      )}

      {/* Audio call, or video that hasn't arrived yet: big avatar in the middle */}
      {!showRemoteVideo && !(isGroup && consumers.length > 0) && (
        <View style={s.center}>
          <View style={s.avatarWrap}>
            <Pulse active={!live} size={140} />
            <Avatar name={title} photo={contact?.profile_image} size={140} />
          </View>
        </View>
      )}

      {/* Top: name and status (timer once connected) */}
      <LinearGradient colors={["rgba(0,0,0,0.6)", "transparent"]} style={[s.top, { paddingTop: insets.top + 16 }]} pointerEvents="box-none">
        <View style={s.topText}>
          <View style={s.encRow}>
            <MaterialCommunityIcons name="lock" size={12} color="rgba(255,255,255,0.7)" />
            <Text style={s.encText}>End-to-end encrypted</Text>
          </View>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <Text style={s.status}>{isAudio ? "Voice call · " : "Video call · "}{status}</Text>
          {poorNetwork && live && (
            <View style={s.poorNet}>
              <MaterialCommunityIcons name="wifi-strength-1-alert" size={14} color="#FDE68A" />
              <Text style={s.poorNetText}>Poor connection</Text>
            </View>
          )}
        </View>
        {/* Leave the call screen, the call keeps going (a green bar and a notification bring it back) */}
        <TouchableOpacity
          style={[s.addBtn, s.leftBtn, { top: insets.top + 16 }]}
          onPress={() => router.canGoBack() ? router.back() : router.replace("/screens/chat")}
          accessibilityLabel="Minimize call"
        >
          <MaterialCommunityIcons name="chevron-down" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        {pipSupported && !isAudio && (
          <TouchableOpacity
            style={[s.addBtn, s.pipBtn, { top: insets.top + 16 }]}
            onPress={() => ExpoPip.enterPipMode(PIP_SIZE)}
            accessibilityLabel="Minimize to a small window"
          >
            <MaterialCommunityIcons name="picture-in-picture-bottom-right" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        {!isGroup && (
          <TouchableOpacity style={[s.addBtn, { top: insets.top + 16 }]} onPress={() => setOpenContact(true)} accessibilityLabel="Add people">
            <MaterialCommunityIcons name="account-plus" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </LinearGradient>

      {/* My camera, small in the corner */}
      {!isAudio && myVideo && (
        <DraggableSelfView top={insets.top + 110} bottom={insets.bottom + 150} onTap={flipCamera}>
          {cameraOff ? (
            <View style={s.selfOff}>
              <MaterialCommunityIcons name="video-off" size={26} color="rgba(255,255,255,0.8)" />
            </View>
          ) : (
            <RTCView streamURL={myVideo.toURL()} style={s.selfVideo} objectFit="cover" zOrder={1} mirror />
          )}
        </DraggableSelfView>
      )}

      {/* Controls */}
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={[s.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <View style={s.row}>
          <CallButton icon={isSpeakerOn ? "volume-high" : "volume-medium"} label="Speaker" on={isSpeakerOn} onPress={toggleSpeaker} />
          {isAudio
            ? <CallButton icon="video-outline" label="Video" onPress={handleSwitchCallType} />
            : <CallButton icon={cameraOff ? "video-off" : "video"} label={cameraOff ? "Camera on" : "Camera off"} on={cameraOff} onPress={toggleCam} />}
          <CallButton icon={muted ? "microphone-off" : "microphone"} label={muted ? "Unmute" : "Mute"} on={muted} onPress={toggleMic} />
          {!isAudio && <CallButton icon="camera-flip-outline" label="Flip" onPress={flipCamera} />}
          <CallButton icon="phone-hangup" label="End" danger onPress={endCall} />
        </View>
      </LinearGradient>

      {/* Add people to a 1:1 call */}
      {!isGroup && (
        <BottomSheet visible={openContact} onClose={() => setOpenContact(false)} sheetHeight={550}>
          <Text style={s.sheetTitle}>Add people</Text>
          <FlatList
            data={contacts}
            keyExtractor={(item) => String(item.phone)}
            renderItem={({ item }: { item: any }) => {
              const picked = selectedUsers.some((u) => u.phone === item.phone);
              return (
                <TouchableOpacity style={appStyles.contactItemBottomSheet} onPress={() => toggleSelectUser(item)}>
                  <Avatar name={item.name || item.phone} photo={item.profile_image} size={44} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={appStyles.contactNameBottomSheet}>{item.name || item.phone}</Text>
                    <Text style={appStyles.contactSubTextBottomSheet}>{item.phone}</Text>
                  </View>
                  <MaterialCommunityIcons
                    name={picked ? "check-circle" : "checkbox-blank-circle-outline"}
                    size={24}
                    color={picked ? colors.primary : colors.textMuted}
                  />
                </TouchableOpacity>
              );
            }}
          />
          <View style={s.sheetButtons}>
            <TouchableOpacity style={[s.sheetBtn, s.sheetBtnGhost]} onPress={() => setOpenContact(false)}>
              <Text style={[s.sheetBtnText, { color: colors.text }]}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.sheetBtn, !selectedUsers.length && { opacity: 0.4 }]}
              disabled={!selectedUsers.length}
              onPress={addToCall}
            >
              <Text style={s.sheetBtnText}>Add{selectedUsers.length ? ` (${selectedUsers.length})` : ""}</Text>
            </TouchableOpacity>
          </View>
        </BottomSheet>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  avatarWrap: { alignItems: "center", justifyContent: "center" },
  pulse: { position: "absolute", backgroundColor: colors.primary },
  initials: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  initialsText: { color: "#FFFFFF", fontWeight: "700" },

  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 30 },
  // Side padding leaves room for the buttons on both sides
  topText: { alignItems: "center", paddingHorizontal: 104 },
  encRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  encText: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "700", textAlign: "center" },
  status: { color: "rgba(255,255,255,0.75)", fontSize: 15, marginTop: 4, textAlign: "center" },
  addBtn: { position: "absolute", right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },

  leftBtn: { right: undefined, left: 16 },
  pipBtn: { right: undefined, left: 68 },
  // Placed by DraggableSelfView (moved with translate from the top-left corner)
  // Rounded with styles. iOS rounds the video too; Android draws video on its own layer that
  // styles can't clip, so there the video itself stays square
  selfView: {
    position: "absolute", left: 0, top: 0, width: SELF_W, height: SELF_H,
    borderRadius: SELF_RADIUS, overflow: "hidden", backgroundColor: "#000",
  },
  selfVideo: { flex: 1, borderRadius: SELF_RADIUS },
  poorNet: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.45)" },
  poorNetText: { color: "#FDE68A", fontSize: 12, fontWeight: "600" },
  selfOff: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1E293B" },

  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 40, paddingHorizontal: 12 },
  row: { flexDirection: "row", justifyContent: "space-evenly", alignItems: "flex-start" },
  btnWrap: { alignItems: "center", width: 68 },
  btn: { width: 58, height: 58, borderRadius: 29, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  btnOn: { backgroundColor: "#FFFFFF" },
  btnDanger: { backgroundColor: colors.danger },
  btnLabel: { color: "#FFFFFF", fontSize: 12, marginTop: 8 },

  sheetTitle: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 8 },
  sheetButtons: { flexDirection: "row", gap: 12, marginTop: 12 },
  sheetBtn: { flex: 1, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  sheetBtnGhost: { backgroundColor: colors.surfaceAlt },
  sheetBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
