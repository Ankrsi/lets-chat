import { colors } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { AudioPlayer as ExpoAudioPlayer, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, LayoutChangeEvent, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// Only one chat audio plays at a time
let activePlayer: ExpoAudioPlayer | null = null;

const formatTime = (seconds: number) => {
  if (!seconds || seconds < 0 || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const readContent = (raw: any) => {
  let c: any = raw;
  if (typeof raw === "string") {
    try { c = JSON.parse(raw); } catch { c = {}; }
  }
  const first = Array.isArray(c?.urls) ? c.urls[0] : null;
  return {
    url: c?.url || first?.url || first || null,
    name: c?.name || first?.name || null,
    duration: Number(c?.duration) || 0,
  };
};

const AudioPlayer = ({ data, onLongPress }: any) => {
  const content = useMemo(() => readContent(data?.content), [data?.content]);
  const isVoice = data?.messageType === "voice";

  // Streams instead of downloading the whole file as soon as the message is on screen
  const player = useAudioPlayer(content.url ? { uri: content.url } : null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [trackWidth, setTrackWidth] = useState(0);

  const duration = status.duration || content.duration || 0;
  const current = status.currentTime || 0;
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;
  const playing = status.playing;

  // Back to the start when it finishes
  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  const toggle = () => {
    if (!content.url) return;
    if (playing) {
      player.pause();
      return;
    }
    if (activePlayer && activePlayer !== player) {
      try { activePlayer.pause(); } catch { /* already released */ }
    }
    activePlayer = player;
    player.play();
  };

  const seek = (x: number) => {
    if (!duration || !trackWidth) return;
    player.seekTo(Math.max(0, Math.min(duration, (x / trackWidth) * duration)));
  };

  if (!content.url) {
    return <Text style={styles.unavailable}>Audio unavailable</Text>;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.playBtn} onPress={toggle} onLongPress={onLongPress} activeOpacity={0.8} accessibilityLabel={playing ? "Pause" : "Play"}>
        {status.isBuffering && playing
          ? <ActivityIndicator size="small" color="#FFFFFF" />
          : <Ionicons name={playing ? "pause" : "play"} size={18} color="#FFFFFF" style={!playing && { marginLeft: 2 }} />}
      </TouchableOpacity>

      <View style={styles.body}>
        {!isVoice && !!content.name && (
          <Text style={styles.name} numberOfLines={1}>
            <Ionicons name="musical-notes" size={12} color={colors.textSecondary} /> {content.name}
          </Text>
        )}
        {/* Tap or drag along the track to seek */}
        <Pressable
          style={styles.trackHit}
          onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
          onPress={(e) => seek(e.nativeEvent.locationX)}
          onLongPress={onLongPress}
        >
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={[styles.knob, { left: `${progress * 100}%` }]} />
        </Pressable>
        <View style={styles.timeRow}>
          <Text style={styles.time}>{formatTime(playing || current > 0 ? current : duration)}</Text>
          {isVoice && <Ionicons name="mic" size={12} color={colors.primary} />}
        </View>
      </View>
    </View>
  );
};

export default AudioPlayer;

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 210, maxWidth: 260, paddingVertical: 2 },
  playBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1 },
  name: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 2 },
  trackHit: { height: 22, justifyContent: "center" },
  track: { height: 4, borderRadius: 2, backgroundColor: "rgba(15,23,42,0.12)", overflow: "hidden" },
  fill: { height: 4, backgroundColor: colors.primary },
  knob: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    backgroundColor: colors.primary,
    top: 5,
  },
  timeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  time: { fontSize: 11, color: colors.textSecondary },
  unavailable: { fontSize: 13, color: colors.textSecondary },
});
