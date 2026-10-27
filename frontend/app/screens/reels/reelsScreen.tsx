import BottomTabBar from "@/app/components/BottomTabBar";
import ReelsPager from "@/app/components/ReelsPager";
import { ReelStyles } from "@/app/styles";
import { apiErrorMessage } from "@/utils/api";
import { getGlobalUsername } from "@/utils/globalRefs";
import { deleteReel, fetchFeed, fetchSuggested, Reel, takeFeedStale } from "@/utils/reels";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { ActivityIndicator, Alert, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Source = "feed" | "suggested";

const nextPage = async (source: Source, before: string | null): Promise<{ reels: Reel[]; source: Source; cursor: string | null }> => {
  if (source === "feed") {
    const page = await fetchFeed(before);
    if (page.nextCursor) return { reels: page.reels, source, cursor: page.nextCursor };
    const more = await fetchSuggested().catch(() => ({ reels: [] as Reel[], nextCursor: null }));
    return { reels: [...page.reels, ...more.reels], source: "suggested", cursor: more.nextCursor };
  }
  const page = await fetchSuggested(before);
  return { reels: page.reels, source, cursor: page.nextCursor };
};

export default function ReelsScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const [reels, setReels] = useState<Reel[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [source, setSource] = useState<Source>("feed");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);

  const loadFirstPage = useCallback(async () => {
    try {
      const page = await nextPage("feed", null);
      setReels(page.reels);
      setSource(page.source);
      setCursor(page.cursor);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load reels."));
    }
  }, []);

  useEffect(() => {
    loadFirstPage().finally(() => setLoading(false));
  }, [loadFirstPage]);

  // Coming back after posting a reel: show it
  useFocusEffect(useCallback(() => {
    if (takeFeedStale()) loadFirstPage();
  }, [loadFirstPage]));

  const refresh = async () => {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await nextPage(source, cursor);
      setReels((prev) => [...prev, ...page.reels.filter((r) => !prev.some((p) => p._id === r._id))]);
      setSource(page.source);
      setCursor(page.cursor);
    } catch (err) {
      console.info("load more reels failed", err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
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
      setReels((prev) => prev.filter((r) => r._id !== reel._id));
      setPendingDelete(null);
    } catch (err) {
      setPendingDelete(null);
      Alert.alert("Couldn't delete", apiErrorMessage(err));
    }
  };

  const openProfile = useCallback((reel: Reel) => {
    router.push({ pathname: "/screens/reels/userProfile", params: { phone: reel.author.phone } });
  }, [router]);

  return (
    <SafeAreaView style={ReelStyles.root} edges={["top", "left", "right"]}>
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
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={ReelStyles.empty}><ActivityIndicator color="#FFFFFF" size="large" /></View>
        ) : error && reels.length === 0 ? (
          <View style={ReelStyles.empty}>
            <Ionicons name="cloud-offline-outline" size={56} color="#666666" />
            <Text style={ReelStyles.emptyTitle}>{error}</Text>
            <TouchableOpacity style={ReelStyles.emptyBtn} onPress={() => { setLoading(true); loadFirstPage().finally(() => setLoading(false)); }}>
              <Text style={ReelStyles.emptyBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : reels.length === 0 ? (
          <View style={ReelStyles.empty}>
            <Ionicons name="play-circle-outline" size={64} color="#555555" />
            <Text style={ReelStyles.emptyTitle}>No reels yet</Text>
            <Text style={ReelStyles.emptySub}>No one has posted yet. Post the first reel, or find people to follow.</Text>
            <TouchableOpacity style={ReelStyles.emptyBtn} onPress={() => router.push("/screens/reels/findPeople")}>
              <Text style={ReelStyles.emptyBtnText}>Find people</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ReelsPager
            reels={reels}
            focused={focused && !pendingDelete}
            refreshing={refreshing}
            onRefresh={refresh}
            onEndReached={loadMore}
            loadingMore={loadingMore}
            onAuthorPress={openProfile}
            onDelete={confirmDelete}
          />
        )}

        {/* Top bar over the video */}
        <View style={ReelStyles.topBar} pointerEvents="box-none">
          <Text style={[ReelStyles.topTitle, ReelStyles.shadow]}>Reels</Text>
          <TouchableOpacity style={ReelStyles.topBtn} onPress={() => router.push("/screens/reels/findPeople")} hitSlop={8}>
            <Ionicons name="search" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={ReelStyles.topBtn}
            onPress={() => router.push({ pathname: "/screens/reels/userProfile", params: { phone: String(getGlobalUsername() ?? "") } })}
            hitSlop={8}
          >
            <Ionicons name="person-circle-outline" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={ReelStyles.topBtn} onPress={() => router.push("/screens/reels/uploadReel")} hitSlop={8}>
            <Ionicons name="add-circle-outline" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <BottomTabBar active="reels" />
    </SafeAreaView>
  );
}
