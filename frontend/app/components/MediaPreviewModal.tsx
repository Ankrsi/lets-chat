import { colors, radius } from "@/theme";
import { documentKind, MediaItem } from "@/utils/media";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView, Modal, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DocumentCard from "./DocumentCard";

interface Props {
  visible: boolean;
  items: MediaItem[];
  captions: string[];
  onChangeCaption: (index: number, text: string) => void;
  onRemove: (index: number) => void;
  onClose: () => void;
  onSend: () => void;
}

const formatSeconds = (s?: number | null) => {
  if (!s) return null;
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

// Only the page on screen gets a player; it's released when you swipe away
function PreviewVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />;
}

function Page({ item, active }: { item: MediaItem; active: boolean }) {
  if (item.kind === "image") {
    return <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />;
  }
  if (item.kind === "video") {
    return active ? <PreviewVideo uri={item.uri} /> : (
      <View style={styles.center}>
        <Ionicons name="videocam" size={56} color="rgba(255,255,255,0.35)" />
      </View>
    );
  }
  return (
    <View style={styles.center}>
      <DocumentCard name={item.name} size={item.size} mimeType={item.mimeType} preview />
    </View>
  );
}

function Thumb({ item }: { item: MediaItem }) {
  if (item.kind === "image") return <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />;
  if (item.kind === "video") {
    return (
      <View style={[StyleSheet.absoluteFill, styles.thumbCenter, { backgroundColor: "#1F2937" }]}>
        <Ionicons name="videocam" size={20} color="#FFFFFF" />
        {!!formatSeconds(item.duration) && <Text style={styles.thumbText}>{formatSeconds(item.duration)}</Text>}
      </View>
    );
  }
  const kind = documentKind(item.name, item.mimeType);
  return (
    <View style={[StyleSheet.absoluteFill, styles.thumbCenter, { backgroundColor: "#FFFFFF" }]}>
      <Ionicons name={kind.icon} size={20} color={kind.color} />
      <Text style={[styles.thumbText, { color: kind.color }]}>{kind.label}</Text>
    </View>
  );
}

export default function MediaPreviewModal({ visible, items, captions, onChangeCaption, onRemove, onClose, onSend }: Props) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const thumbsRef = useRef<ScrollView>(null);
  const [current, setCurrent] = useState(0);
  // Pages are sized from the measured area (not the window), so each one snaps exactly to the centre
  const [page, setPage] = useState({ width: 0, height: 0 });
  const width = page.width;

  // New selection: start at the first item
  useEffect(() => {
    if (visible) {
      setCurrent(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [visible]);

  // Keep the index valid when an item is removed
  useEffect(() => {
    if (current > items.length - 1) setCurrent(Math.max(0, items.length - 1));
  }, [items.length, current]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const index = Math.max(0, Math.min(Math.round(e.nativeEvent.contentOffset.x / width), items.length - 1));
    setCurrent(index);
    // Settle exactly on the page in case the swipe stopped between two
    if (Math.abs(e.nativeEvent.contentOffset.x - index * width) > 1) {
      scrollRef.current?.scrollTo({ x: index * width, animated: true });
    }
  };

  // Keep the current page centred when the area resizes (keyboard, rotation)
  useEffect(() => {
    if (width) scrollRef.current?.scrollTo({ x: current * width, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  // Keep the active thumbnail in view
  useEffect(() => {
    thumbsRef.current?.scrollTo({ x: Math.max(0, current * 64 - 100), animated: true });
  }, [current]);

  const goTo = (index: number) => {
    setCurrent(index);
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
  };

  const remove = (index: number) => {
    if (items.length === 1) return onClose();
    onRemove(index);
    const next = Math.min(index, items.length - 2);
    setCurrent(next);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ x: next * width, animated: false }));
  };

  const item = items[current];
  const title = item?.kind === "document" ? item.name : null;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        {/* Pages */}
        <View
          style={{ flex: 1 }}
          onLayout={(e) => {
            const { width: w, height: h } = e.nativeEvent.layout;
            setPage((prev) => (Math.round(w) === prev.width && Math.round(h) === prev.height ? prev : { width: Math.round(w), height: Math.round(h) }));
          }}
        >
          {page.width > 0 && page.height > 0 && (
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              snapToInterval={width}
              snapToAlignment="center"
              decelerationRate="fast"
              disableIntervalMomentum
              style={{ width, height: page.height }}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleScroll}
              keyboardShouldPersistTaps="handled"
            >
              {items.map((it, i) => (
                <View key={it.uri} style={{ width, height: page.height }}>
                  <Page item={it} active={visible && i === current} />
                </View>
              ))}
            </ScrollView>
          )}

          {/* Top bar */}
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
            <TouchableOpacity onPress={onClose} style={styles.roundBtn} hitSlop={8} accessibilityLabel="Close preview">
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            {!!title && <Text style={styles.title} numberOfLines={1}>{title}</Text>}
            <View style={styles.topRight}>
              {items.length > 1 && (
                <View style={styles.counter}>
                  <Text style={styles.counterText}>{current + 1} / {items.length}</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => remove(current)} style={styles.roundBtn} hitSlop={8} accessibilityLabel="Remove this item">
                <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Thumbnails */}
        {items.length > 1 && (
          <ScrollView
            ref={thumbsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            // Android lays horizontal content out unbounded, so flexGrow can't centre it; a min width can
            contentContainerStyle={[styles.thumbs, { minWidth: width }]}
            keyboardShouldPersistTaps="handled"
          >
            {items.map((it, i) => (
              <TouchableOpacity key={it.uri} onPress={() => goTo(i)} activeOpacity={0.8}>
                <View style={[styles.thumb, i === current && styles.thumbActive]}>
                  <Thumb item={it} />
                  {!!captions[i]?.trim() && (
                    <View style={styles.captionDot}>
                      <Ionicons name="text" size={9} color="#FFFFFF" />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Caption + send */}
        <View style={[styles.captionBar, { paddingBottom: 10 + insets.bottom }]}>
          <View style={styles.inputWrap}>
            <TextInput
              value={captions[current] || ""}
              onChangeText={(t) => onChangeCaption(current, t)}
              placeholder={items.length > 1 ? `Add a caption to item ${current + 1}…` : "Add a caption…"}
              placeholderTextColor="rgba(255,255,255,0.5)"
              style={styles.input}
              multiline
              maxLength={1000}
            />
          </View>
          <TouchableOpacity onPress={onSend} style={styles.sendBtn} accessibilityLabel={`Send ${items.length}`}>
            <Ionicons name="send" size={20} color={colors.textOnPrimary} />
            {items.length > 1 && (
              <View style={styles.sendBadge}>
                <Text style={styles.sendBadgeText}>{items.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  title: { flex: 1, color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  topRight: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: "auto" },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  counter: { backgroundColor: "rgba(0,0,0,0.45)", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  counterText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  thumbs: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  thumb: { width: 56, height: 56, borderRadius: 12, overflow: "hidden", opacity: 0.6, borderWidth: 2, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  thumbActive: { opacity: 1, borderColor: colors.primary },
  thumbCenter: { alignItems: "center", justifyContent: "center", gap: 2 },
  thumbText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  captionDot: {
    position: "absolute",
    right: 3,
    bottom: 3,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  captionBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 12, paddingTop: 10 },
  inputWrap: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 24,
    paddingHorizontal: 16,
    minHeight: 48,
    justifyContent: "center",
  },
  input: { color: "#FFFFFF", fontSize: 15, paddingVertical: 10, maxHeight: 110 },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBadgeText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
});
