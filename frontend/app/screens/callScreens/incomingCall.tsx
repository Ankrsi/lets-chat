import { handleAudioIncommingCall } from "@/contexts/CallController";
import { acceptGroupCall } from "@/contexts/groupCallService";
import { handleIncommingVideoCall, rejectVideoCall } from "@/contexts/videoCallController";
import { getGlobalSocket, getGlobalUsername } from "@/utils/globalRefs";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Image, Text, TouchableOpacity, View } from "react-native";
import inCallManager from "react-native-incall-manager";

export default function IncomingCallScreen() {
  const socket = getGlobalSocket();
  const router = useRouter();
  const username = getGlobalUsername();
  const { data } = useLocalSearchParams();
  const parsedData = typeof data === "string" ? JSON.parse(data) : data;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
    (async () => {
    })()
  }, [])

  const handlePickGroupCall = (data: any) => {
    router.dismiss(1);
    inCallManager.stopRingtone();
    acceptGroupCall(socket!, username!);
  }

  const handlePickCall = (data: any) => {
    router.canGoBack() && router.back();
    inCallManager.stopRingtone();
    if (data.type == "audio_call") {
      handleAudioIncommingCall({
        callId: data?.callId,
        from: data?.fromm,
        to: data?.to,
        offer: JSON.parse(data?.offer),
        offerType: data?.offerType,
        conversationId: data?.conversationId,
      });
    }
    if (data.type == "video_call") {
      handleIncommingVideoCall({
        socket,
        callId: data?.callId,
        from: data?.fromm,
        to: data?.to,
        conversationId: data?.conversationId,
      })
    }
    // handleHide();
  };

  const handleDropCall = (data: any) => {
    router.canGoBack() && router.back();
    inCallManager.stopRingtone();
    if (data.type == "audio_call") {
      socket?.emit("call:reject", { callId: data?.callId, from: data?.to, to: data?.fromm });
    }
    if (data.type == "video_call") {
      rejectVideoCall(socket!, data?.to, data?.fromm);
    }
    // handleHide();
  };

  return (
    <LinearGradient colors={["#0d1b2a", "#1b263b", "#0d1b2a"]} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Animated.Image
        // source={{ uri: typeof callerAvatar === "string" ? callerAvatar : "https://randomuser.me/api/portraits/men/75.jpg" }}
        source={{ uri: "https://randomuser.me/api/portraits/men/75.jpg" }}
        style={{
          width: 150,
          height: 150,
          borderRadius: 75,
          transform: [{ scale: pulse }],
          borderWidth: 3,
          borderColor: "#00ff88",
        }}
      />
      <Text style={{ color: "#fff", fontSize: 26, fontWeight: "700", marginTop: 20, textAlign: 'center' }}>
        {`Incoming call from ${parsedData?.fromm || "Unknown"}`}
      </Text>
      <Text style={{ color: "#a0a0a0", fontSize: 18, marginTop: 6 }}>Voice call...</Text>

      <View style={{ flexDirection: "row", justifyContent: "space-between", width: "70%", position: "absolute", bottom: 80 }}>
        {/* Decline */}
        <TouchableOpacity onPress={() => { handleDropCall(parsedData) }} style={{ alignItems: "center" }}>
          <View style={{ backgroundColor: "#f44336", width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" }}>
            <Image source={{ uri: "https://cdn-icons-png.flaticon.com/512/1828/1828843.png" }} style={{ width: 35, height: 35, tintColor: "#fff" }} />
          </View>
          <Text style={{ color: "#fff", marginTop: 10 }}>Decline</Text>
        </TouchableOpacity>

        {/* Accept */}
        <TouchableOpacity
          onPress={() => parsedData.callType == "groupCall" ? handlePickGroupCall(parsedData) : handlePickCall(parsedData)}
          style={{ alignItems: "center" }}
        >
          <View style={{ backgroundColor: "#4CAF50", width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" }}>
            <Image source={{ uri: "https://cdn-icons-png.flaticon.com/512/724/724664.png" }} style={{ width: 35, height: 35, tintColor: "#fff" }} />
          </View>
          <Text style={{ color: "#fff", marginTop: 10 }}>Accept</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}
