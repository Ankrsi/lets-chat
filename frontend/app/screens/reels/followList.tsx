import { ReelStyles, SectionTabStyles, SettingsStyle } from "@/app/styles";
import { colors } from "@/theme";
import { displayName, fetchFollowList, FollowListUser, followUser, unfollowUser } from "@/utils/reels";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Tab = "followers" | "following";

function UserRow({ user, onPress }: { user: FollowListUser; onPress: () => void }) {
  const [following, setFollowing] = useState(user.isFollowing);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      if (following) await unfollowUser(user.phone);
      else await followUser(user.phone);
      setFollowing(!following);
    } catch (err) {
      console.info("follow toggle failed", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity style={ReelStyles.personRow} onPress={onPress} activeOpacity={0.6}>
      <View style={ReelStyles.personAvatar}>
        {user.profile_image
          ? <Image source={{ uri: user.profile_image }} style={{ width: 44, height: 44 }} />
          : <Ionicons name="person" size={22} color={colors.primary} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ReelStyles.personName} numberOfLines={1}>{user.isMe ? "You" : displayName(user)}</Text>
        {user.username && <Text style={ReelStyles.personSub} numberOfLines={1}>@{user.username}</Text>}
      </View>
      {!user.isMe && (
        <TouchableOpacity
          style={[ReelStyles.listFollowBtn, following && ReelStyles.listFollowingBtn]}
          onPress={toggle}
          disabled={busy}
        >
          {busy
            ? <ActivityIndicator size="small" color={following ? colors.text : colors.textOnPrimary} />
            : <Text style={[ReelStyles.listFollowText, following && ReelStyles.listFollowingText]}>{following ? "Following" : "Follow"}</Text>}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default function FollowListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone: string; tab?: Tab; name?: string }>();
  const phone = String(params.phone);
  const [tab, setTab] = useState<Tab>(params.tab === "following" ? "following" : "followers");
  const [users, setUsers] = useState<FollowListUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const loadingMore = useRef(false);

  const load = useCallback(async () => {
    try {
      const page = await fetchFollowList(phone, tab);
      setUsers(page.users);
      setCursor(page.nextCursor);
      setError(false);
    } catch {
      setError(true);
    }
  }, [phone, tab]);

  useEffect(() => {
    setUsers([]);
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (!cursor || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await fetchFollowList(phone, tab, cursor);
      setUsers((prev) => [...prev, ...page.users.filter((u) => !prev.some((p) => p.phone === u.phone))]);
      setCursor(page.nextCursor);
    } catch (err) {
      console.info("load more failed", err);
    } finally {
      loadingMore.current = false;
    }
  };

  const open = (user: FollowListUser) =>
    router.push({ pathname: "/screens/reels/userProfile", params: { phone: user.phone } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <View style={SettingsStyle.header}>
        <TouchableOpacity style={SettingsStyle.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={SettingsStyle.headerTitle} numberOfLines={1}>{params.name || "People"}</Text>
      </View>

      <View style={SectionTabStyles.row}>
        {(["followers", "following"] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[SectionTabStyles.tab, tab === t && SectionTabStyles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[SectionTabStyles.text, tab === t && SectionTabStyles.textActive]}>
              {t === "followers" ? "Followers" : "Following"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={users}
            keyExtractor={(u) => u.phone}
            renderItem={({ item }) => <UserRow user={item} onPress={() => open(item)} />}
            ItemSeparatorComponent={() => <View style={SettingsStyle.divider} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} />}
            ListEmptyComponent={
              <Text style={ReelStyles.hintText}>
                {error
                  ? "Couldn't load the list. Pull down to try again."
                  : tab === "followers" ? "No followers yet." : "Not following anyone yet."}
              </Text>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}
