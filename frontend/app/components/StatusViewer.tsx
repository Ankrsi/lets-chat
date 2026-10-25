import { CHATAPI } from "@/utils/api";
import { colors, font, radius } from "@/theme";
import { getGlobalUsername } from "@/utils/globalRefs";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, AppState, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const IMAGE_MS = 5000;
const VIDEO_FALLBACK_MS = 15000;

export const statusTimeAgo = (iso?: string | null) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
};

type Props = {
  myStatus: boolean;
  user: any;
  /** Display name and avatar for the header */
  title: string;
  avatar?: string | null;
  onClose: () => void;
  /** Name / photo of a viewer, for your own status's "views" list */
  profileOf?: (phone: string) => { name?: string; profile_image?: string } | undefined;
};

export default function StatusViewer({ myStatus, user, title, avatar, onClose, profileOf }: Props) {
  const username = getGlobalUsername();
  const insets = useSafeAreaInsets();
  const stories: any[] = user?.stories ?? [];
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const pausedRef = useRef(false);
  const loadingRef = useRef(true);
  loadingRef.current = loading;
  const current = stories[index];
  const isVideo = current?.type === "video";

  // Progress of the current story (0..1); kept so a hold can pause and resume from the same point
  const progress = useRef(new Animated.Value(0)).current;
  const totalMs = useRef(IMAGE_MS);
  const pausedAt = useRef(0);
  const indexRef = useRef(0);
  indexRef.current = index;

  const player = useVideoPlayer(isVideo ? current.url : null, (p) => {
    p.loop = false;
  });

  const next = useCallback(() => {
    if (indexRef.current < stories.length - 1) setIndex(indexRef.current + 1);
    else onClose();
  }, [stories.length, onClose]);

  const prev = () => {
    if (indexRef.current > 0) return setIndex(indexRef.current - 1);
    // first story: restart it
    if (isVideo) player.currentTime = 0;
    startProgress(0);
  };

  const startProgress = (from: number) => {
    progress.stopAnimation();
    progress.setValue(from);
    Animated.timing(progress, {
      toValue: 1,
      duration: Math.max(200, totalMs.current * (1 - from)),
      useNativeDriver: false,
    }).start(({ finished }) => finished && next());
  };

  // New story: reset, mark as seen, wait for the media before the bar starts.
  // Layout effect so the reset lands before an already-cached image reports it has loaded.
  useLayoutEffect(() => {
    if (!current) return;
    progress.stopAnimation();
    progress.setValue(0);
    pausedAt.current = 0;
    pausedRef.current = false;
    setPaused(false);
    setLoading(true);
    totalMs.current = IMAGE_MS;
    if (!myStatus && current._id) {
      CHATAPI.get(`/chats/markStatusAsViewed/${current._id}?timestamp=${new Date().toISOString()}`).catch(() => undefined);
    }
    if (!isVideo) return;
    const sub = player.addListener("statusChange", ({ status }: any) => {
      if (status === "readyToPlay") {
        totalMs.current = player.duration > 0 ? player.duration * 1000 : VIDEO_FALLBACK_MS;
        setLoading(false);
        player.play();
        startProgress(0);
      } else if (status === "error") {
        setLoading(false);
        totalMs.current = 1500;
        startProgress(0);
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => () => progress.stopAnimation(), [progress]);

  const pause = () => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    progress.stopAnimation((v) => { pausedAt.current = v; });
    if (isVideo) player.pause();
    setPaused(true);
  };

  const resume = () => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    if (loadingRef.current) return;
    if (isVideo) player.play();
    startProgress(pausedAt.current);
  };

  // Pause while the app is in the background
  const pauseRef = useRef({ pause, resume });
  pauseRef.current = { pause, resume };
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") pauseRef.current.resume();
      else pauseRef.current.pause();
    });
    return () => sub.remove();
  }, []);

  const removeStory = () => {
    pause();
    Alert.alert("Delete this status update?", "It will be removed for everyone.", [
      { text: "Cancel", style: "cancel", onPress: resume },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await CHATAPI.post(`/chats/removeStatus`, { storyId: current._id });
            if (res.success === true || res.statusCode == 200) onClose();
            else { Alert.alert("Couldn't delete", res.message || "Try again."); resume(); }
          } catch (err: any) {
            Alert.alert("Couldn't delete", err?.message || "Try again.");
            resume();
          }
        },
      },
    ]);
  };

  if (!current) return null;

  const viewers = (current.viewers ?? []).filter((v: any) => v.phone !== username);

  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={() => (showViewers ? (setShowViewers(false), resume()) : onClose())}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.container}>
        {/* Media */}
        {isVideo ? (
          <VideoView style={styles.media} player={player} nativeControls={false} contentFit="contain" />
        ) : (
          <Image
            key={current._id || current.url}
            source={{ uri: current.url }}
            style={styles.media}
            contentFit="contain"
            cachePolicy="memory-disk"
            onLoad={() => { setLoading(false); startProgress(0); }}
            onError={() => { setLoading(false); startProgress(0); }}
          />
        )}
        {loading && <ActivityIndicator style={StyleSheet.absoluteFill} size="large" color="#fff" />}

        {/* Tap left/right to move, hold anywhere to pause */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPressIn={pause}
          onPressOut={resume}
          onLongPress={() => undefined}
          delayLongPress={250}
          onPress={(e) => (e.nativeEvent.locationX < 120 ? prev() : next())}
        />

        {/* Top: progress + who/when */}
        <LinearGradient colors={["rgba(0,0,0,0.6)", "transparent"]} style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <View style={styles.progressRow}>
            {stories.map((s: any, i: number) => (
              <View key={s._id || i} style={styles.progressBg}>
                {i < index && <View style={[styles.progressFill, { width: "100%" }]} />}
                {i === index && (
                  <Animated.View
                    style={[styles.progressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}
                  />
                )}
              </View>
            ))}
          </View>
          <View style={styles.header}>
            <Image source={avatar ? { uri: avatar } : require("../../assets/images/user.png")} style={styles.avatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{myStatus ? "My status" : title}</Text>
              <Text style={styles.time}>{statusTimeAgo(current.createdAt)}{paused && !loading ? "  ·  Paused" : ""}</Text>
            </View>
            {myStatus && (
              <TouchableOpacity style={styles.headerBtn} onPress={removeStory} hitSlop={8} accessibilityLabel="Delete status">
                <Ionicons name="trash-outline" size={22} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Bottom: caption, and who has seen it (yours) */}
        {(!!current.caption || myStatus) && (
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
            {!!current.caption && <Text style={styles.caption} pointerEvents="none">{current.caption}</Text>}
            {myStatus && (
              <TouchableOpacity
                style={styles.viewsPill}
                onPress={() => { pause(); setShowViewers(true); }}
                hitSlop={10}
                accessibilityLabel="Who viewed this"
              >
                <Ionicons name="eye-outline" size={16} color="#fff" />
                <Text style={styles.viewsText}>{viewers.length} {viewers.length === 1 ? "view" : "views"}</Text>
                <Ionicons name="chevron-up" size={14} color="#fff" />
              </TouchableOpacity>
            )}
          </LinearGradient>
        )}

        {/* Who viewed your status (paused while open) */}
        {showViewers && (
          <View style={StyleSheet.absoluteFill}>
            <Pressable style={styles.sheetBackdrop} onPress={() => { setShowViewers(false); resume(); }} />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHead}>
                <Ionicons name="eye-outline" size={18} color={colors.primary} />
                <Text style={styles.sheetTitle}>Viewed by {viewers.length}</Text>
              </View>
              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                {[...viewers]
                  .sort((a: any, b: any) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime())
                  .map((v: any) => {
                    const p = profileOf?.(v.phone);
                    return (
                      <View key={v.phone} style={styles.viewerRow}>
                        <Image source={p?.profile_image ? { uri: p.profile_image } : require("../../assets/images/user.png")} style={styles.viewerAvatar} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.viewerName} numberOfLines={1}>{p?.name || `+${v.phone}`}</Text>
                          <Text style={styles.viewerTime}>{statusTimeAgo(v.viewedAt)}</Text>
                        </View>
                      </View>
                    );
                  })}
                {viewers.length === 0 && <Text style={styles.sheetEmpty}>No views yet</Text>}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  media: { ...StyleSheet.absoluteFillObject },

  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 10, paddingBottom: 24 },
  progressRow: { flexDirection: "row", gap: 4 },
  progressBg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, paddingHorizontal: 4 },
  avatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.surfaceAlt },
  name: { color: "#fff", fontSize: font.body, fontWeight: "700" },
  time: { color: "rgba(255,255,255,0.8)", fontSize: font.small - 1, marginTop: 1 },
  headerBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },

  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 48, paddingHorizontal: 20, alignItems: "center" },
  caption: { color: "#fff", fontSize: font.body + 1, lineHeight: 22, textAlign: "center", marginBottom: 12 },
  viewsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  viewsText: { color: "#fff", fontSize: font.small, fontWeight: "600" },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.primaryMuted, alignSelf: "center", marginBottom: 12 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, paddingHorizontal: 4 },
  sheetTitle: { fontSize: font.h2, fontWeight: "700", color: colors.text },
  viewerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  viewerAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt },
  viewerName: { fontSize: font.body, fontWeight: "600", color: colors.text },
  viewerTime: { fontSize: font.small, color: colors.textSecondary, marginTop: 2 },
  sheetEmpty: { textAlign: "center", color: colors.textMuted, fontSize: font.body, paddingVertical: 28 },
});
