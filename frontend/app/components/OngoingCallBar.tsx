import { colors } from "@/theme";
import { openCallScreen, useActiveCall } from "@/utils/activeCall";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";

const formatTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Green bar at the top of the app while a call is going on and the call screen isn't open.
// Tap it to go back to the call. `top`: the status bar height, so the text sits below it.
export default function OngoingCallBar({ top }: { top: number }) {
  const call = useActiveCall();
  const [, tick] = useState(0);

  // Redraw every second for the timer
  useEffect(() => {
    if (!call?.connectedAt) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [call?.connectedAt]);

  if (!call) return null;
  const video = call.params.callType !== "audio";

  return (
    <TouchableOpacity style={[s.bar, { paddingTop: top + 6 }]} onPress={openCallScreen} activeOpacity={0.85} accessibilityLabel="Return to call">
      <MaterialCommunityIcons name={video ? "video" : "phone"} size={16} color="#FFFFFF" />
      <Text style={s.text}>
        Tap to return to call{call.connectedAt ? ` · ${formatTime(Date.now() - call.connectedAt)}` : " · Calling…"}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 8,
    backgroundColor: colors.success,
  },
  text: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
});
