import { colors, font, radius } from "@/theme";
import { apiErrorMessage } from "@/utils/api";
import { addReelComment, deleteReelComment, displayName, fetchComments, ReelComment } from "@/utils/reels";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, TextInput,
  TouchableOpacity, View, useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ConfirmDialog from "./ConfirmDialog";

const MAX_COMMENT = 500;

const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
};

interface Props {
  reelId: string | null;
  onClose: () => void;
  onCountChange: (reelId: string, count: number) => void;
}

export default function ReelCommentsSheet({ reelId, onClose, onCountChange }: Props) {
  const insets = useSafeAreaInsets();

  // Keyboard: lift the sheet by the keyboard height, minus however much the window itself already
  // shrank (Android may or may not resize a modal's window). Avoids KeyboardAvoidingView, which
  // left the sheet bouncing and floating after the keyboard closed.
  const [keyboard, setKeyboard] = useState(0);
  const [rootHeight, setRootHeight] = useState(0);
  const fullHeight = useRef(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboard(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const resizedBy = fullHeight.current && rootHeight ? Math.max(0, fullHeight.current - rootHeight) : 0;
  const lift = keyboard ? Math.max(0, keyboard - resizedBy) : 0;
  const { height } = useWindowDimensions();
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ReelComment | null>(null);
  const loadingMoreRef = useRef(false);

  // Fresh list each time the sheet opens for a reel
  useEffect(() => {
    if (!reelId) return;
    let alive = true;
    setComments([]);
    setCursor(null);
    setText("");
    setLoading(true);
    fetchComments(reelId)
      .then((page) => {
        if (!alive) return;
        setComments(page.comments);
        setCursor(page.nextCursor);
        setCount(page.commentCount);
        onCountChange(reelId, page.commentCount);
      })
      .catch((err) => alive && Alert.alert("Couldn't load comments", apiErrorMessage(err)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reelId]);

  const loadMore = useCallback(async () => {
    if (!reelId || !cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchComments(reelId, cursor);
      setComments((prev) => [...prev, ...page.comments.filter((c) => !prev.some((p) => p._id === c._id))]);
      setCursor(page.nextCursor);
    } catch (err) {
      console.info("load more comments failed", err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [reelId, cursor]);

  const post = async () => {
    const value = text.trim();
    if (!reelId || !value || posting) return;
    setPosting(true);
    try {
      const res = await addReelComment(reelId, value);
      setComments((prev) => [res.comment, ...prev]);
      setCount(res.commentCount);
      onCountChange(reelId, res.commentCount);
      setText("");
    } catch (err) {
      Alert.alert("Couldn't post comment", apiErrorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  const remove = async () => {
    const c = pendingDelete;
    if (!reelId || !c) return;
    try {
      const n = await deleteReelComment(reelId, c._id);
      setComments((prev) => prev.filter((x) => x._id !== c._id));
      setCount(n);
      onCountChange(reelId, n);
    } catch (err) {
      Alert.alert("Couldn't delete comment", apiErrorMessage(err));
    } finally {
      setPendingDelete(null);
    }
  };

  const renderItem = ({ item }: { item: ReelComment }) => (
    <Pressable
      style={styles.comment}
      onLongPress={() => item.canDelete && setPendingDelete(item)}
      delayLongPress={350}
    >
      {item.author?.profile_image
        ? <Image source={{ uri: item.author.profile_image }} style={styles.avatar} />
        : <View style={styles.avatar}><Ionicons name="person" size={16} color={colors.textMuted} /></View>}
      <View style={{ flex: 1 }}>
        <Text style={styles.meta}>
          <Text style={styles.name}>{item.isMine ? "You" : displayName(item.author)}</Text>
          {"  "}{timeAgo(item.createdAt)}
        </Text>
        <Text style={styles.text}>{item.text}</Text>
      </View>
      {item.canDelete && (
        <TouchableOpacity onPress={() => setPendingDelete(item)} hitSlop={10} accessibilityLabel="Delete comment">
          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </Pressable>
  );

  return (
    <Modal visible={!!reelId} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[styles.sheetWrap, { paddingBottom: lift }]}
        pointerEvents="box-none"
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          setRootHeight(h);
          if (!keyboard && h > fullHeight.current) fullHeight.current = h; // height with no keyboard
        }}
      >
        <View style={[styles.sheet, { height: Math.round(Math.min(height * 0.68, (rootHeight || height) - lift - insets.top - 24)) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Comments{count ? ` (${count})` : ""}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close comments">
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c._id}
              renderItem={renderItem}
              onEndReached={loadMore}
              onEndReachedThreshold={0.4}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={comments.length ? { paddingBottom: 8 } : { flexGrow: 1 }}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Ionicons name="chatbubble-ellipses-outline" size={40} color={colors.primaryMuted} />
                  <Text style={styles.empty}>No comments yet</Text>
                  <Text style={styles.emptySub}>Start the conversation.</Text>
                </View>
              }
              ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 12 }} color={colors.primary} /> : null}
            />
          )}

          <View style={[styles.inputBar, { paddingBottom: keyboard ? 10 : 10 + insets.bottom }]}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Add a comment…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={MAX_COMMENT}
              editable={!posting}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!text.trim() || posting) && { opacity: 0.4 }]}
              onPress={post}
              disabled={!text.trim() || posting}
              accessibilityLabel="Post comment"
            >
              {posting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ConfirmDialog
        visible={!!pendingDelete}
        icon="trash-outline"
        title="Delete comment?"
        message={pendingDelete?.text}
        confirmLabel="Delete"
        destructive
        onConfirm={remove}
        onCancel={() => setPendingDelete(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheetWrap: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: "hidden" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.primaryMuted, alignSelf: "center", marginTop: 10 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  title: { fontSize: font.h2, fontWeight: "700", color: colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  empty: { fontSize: font.body, fontWeight: "700", color: colors.text, marginTop: 10 },
  emptySub: { fontSize: font.small, color: colors.textSecondary, marginTop: 2 },

  comment: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { fontSize: font.small - 1, color: colors.textMuted },
  name: { fontWeight: "700", color: colors.text },
  text: { fontSize: font.body - 1, color: colors.text, marginTop: 2, lineHeight: 20 },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surfaceAlt,
    fontSize: font.body,
    color: colors.text,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
