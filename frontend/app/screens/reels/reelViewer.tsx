import ReelsPager from "@/app/components/ReelsPager";
import { ReelStyles } from "@/app/styles";
import { apiErrorMessage } from "@/utils/api";
import { deleteReel, fetchUserReels, getViewerList, markFeedStale, Reel } from "@/utils/reels";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { ActivityIndicator, Alert, StatusBar, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// One person's reels, full screen, opened from their profile grid
export default function ReelViewerScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const { phone, index } = useLocalSearchParams<{ phone: string; index?: string }>();
  const handoff = getViewerList(phone);
  const [reels, setReels] = useState<Reel[]>(handoff?.reels ?? []);
  const [cursor, setCursor] = useState<string | null>(handoff?.nextCursor ?? null);
  const [loading, setLoading] = useState(!handoff);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    if (handoff) return;
    fetchUserReels(phone)
      .then((page) => { setReels(page.reels); setCursor(page.nextCursor); })
      .catch((err) => { Alert.alert("Couldn't load reels", apiErrorMessage(err)); router.back(); })
      .finally(() => setLoading(false));
    // Only on open: the hand-off list is read once, later changes come from this screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const loadMore = async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    try {
      const page = await fetchUserReels(phone, cursor);
      setReels((prev) => [...prev, ...page.reels.filter((r) => !prev.some((p) => p._id === r._id))]);
      setCursor(page.nextCursor);
    } catch (err) {
      console.info("load more reels failed", err);
    } finally {
      loadingMoreRef.current = false;
    }
  };

  // Reel waiting for the delete confirmation (the video pauses meanwhile)
  const [pendingDelete, setPendingDelete] = useState<Reel | null>(null);
  const confirmDelete = useCallback((reel: Reel) => setPendingDelete(reel), []);

  const deletePending = async () => {
    const reel = pendingDelete;
    if (!reel) return;
    try {
      await deleteReel(reel._id);
      markFeedStale();
      const next = reels.filter((r) => r._id !== reel._id);
      setReels(next);
      setPendingDelete(null);
      if (next.length === 0) router.back();
    } catch (err) {
      setPendingDelete(null);
      Alert.alert("Couldn't delete", apiErrorMessage(err));
    }
  };

  return (
    <SafeAreaView style={ReelStyles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <ConfirmDialog
        visible={!!pendingDelete}
        icon="trash-outline"
        title="Delete reel?"
        message="It will be removed for everyone. This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={deletePending}
        onCancel={() => setPendingDelete(null)}
      />
      {loading ? (
        <View style={ReelStyles.empty}><ActivityIndicator color="#FFFFFF" size="large" /></View>
      ) : (
        <ReelsPager
          reels={reels}
          initialIndex={Number(index) || 0}
          focused={focused && !pendingDelete}
          onEndReached={loadMore}
          onDelete={confirmDelete}
        />
      )}
      <View style={ReelStyles.topBar} pointerEvents="box-none">
        <TouchableOpacity style={ReelStyles.topBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
