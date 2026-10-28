import { colors, statusBarStyle } from "@/theme";
import { ReelStyles, SettingsStyle } from "@/app/styles";
import { apiErrorMessage } from "@/utils/api";
import {
  displayName, fetchSocialProfile, isPhotoReel, reelMediaUrl, fetchUserReels, followUser, markFeedStale, Reel, setViewerList, SocialProfile, unfollowUser,
} from "@/utils/reels";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { loadPreview } from "@/app/components/VideoGrid";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { ActivityIndicator, Alert, FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";

const formatCount = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

function VideoTileThumb({ uri }: { uri: string }) {
  const [thumb, setThumb] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    loadPreview(uri).then((p) => alive && setThumb(p.thumb)).catch(() => undefined);
    return () => { alive = false; };
  }, [uri]);
  if (!thumb) return null;
  return <ExpoImage source={thumb} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />;
}

export default function UserProfileScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [reels, setReels] = useState<Reel[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const p = await fetchSocialProfile(phone);
      setProfile(p);
      if (p.canViewReels) {
        const page = await fetchUserReels(phone);
        setReels(page.reels);
        setCursor(page.nextCursor);
      } else {
        setReels([]);
        setCursor(null);
      }
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load profile."));
    } finally {
      setLoading(false);
    }
  }, [phone]);

  // Reload on focus: counts and reels change after following, posting or deleting
  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  // Unfollow waits for this confirmation
  const [confirmUnfollow, setConfirmUnfollow] = useState<null | (() => Promise<void>)>(null);

  const toggleFollow = async () => {
    if (!profile || busy) return;
    const doIt = async () => {
      setBusy(true);
      try {
        if (profile.isFollowing) await unfollowUser(phone);
        else await followUser(phone);
        markFeedStale(); // their reels enter or leave the feed
        await load();
      } catch (err) {
        Alert.alert("Something went wrong", apiErrorMessage(err));
      } finally {
        setBusy(false);
      }
    };
    if (profile.isFollowing) setConfirmUnfollow(() => doIt);
    else doIt();
  };

  const openReel = (index: number) => {
    setViewerList(phone, reels, cursor);
    router.push({ pathname: "/screens/reels/reelViewer", params: { phone, index: String(index) } });
  };

  const user = profile?.user;
  const openList = (tab: "followers" | "following") =>
    router.push({
      pathname: "/screens/reels/followList",
      params: { phone, tab, name: profile?.isMe ? "You" : displayName(user) },
    });
  const header = profile && user && (
    <View style={ReelStyles.profileHeader}>
      <View style={ReelStyles.profileAvatar}>
        {user.profile_image
          ? <Image source={{ uri: user.profile_image }} style={{ width: 92, height: 92 }} />
          : <Ionicons name="person" size={46} color={colors.primary} />}
      </View>
      <Text style={ReelStyles.profileName}>{profile.isMe ? "You" : displayName(user)}</Text>
      {user.username && <Text style={ReelStyles.profileHandle}>@{user.username}</Text>}

      <View style={ReelStyles.statsRow}>
        <View style={ReelStyles.stat}>
          <Text style={ReelStyles.statValue}>{formatCount(profile.counts.reels)}</Text>
          <Text style={ReelStyles.statLabel}>Reels</Text>
        </View>
        <TouchableOpacity style={ReelStyles.stat} onPress={() => openList("followers")}>
          <Text style={ReelStyles.statValue}>{formatCount(profile.counts.followers)}</Text>
          <Text style={ReelStyles.statLabel}>Followers</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ReelStyles.stat} onPress={() => openList("following")}>
          <Text style={ReelStyles.statValue}>{formatCount(profile.counts.following)}</Text>
          <Text style={ReelStyles.statLabel}>Following</Text>
        </TouchableOpacity>
      </View>

      {profile.isMe ? (
        <TouchableOpacity style={ReelStyles.followBtn} onPress={() => router.push("/screens/reels/uploadReel")}>
          <Text style={ReelStyles.followText}>New reel</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[ReelStyles.followBtn, profile.isFollowing && ReelStyles.followingBtn, busy && ReelStyles.disabled]}
          onPress={toggleFollow}
          disabled={busy}
        >
          {busy
            ? <ActivityIndicator color={profile.isFollowing ? colors.text : colors.textOnPrimary} />
            : <Text style={[ReelStyles.followText, profile.isFollowing && ReelStyles.followingText]}>
              {profile.isFollowing ? "Following" : "Follow"}
            </Text>}
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ConfirmDialog
        visible={!!confirmUnfollow}
        icon="person-remove-outline"
        title={`Unfollow ${profile ? displayName(profile.user) : ""}?`}
        message="You won't see their reels in your feed anymore."
        confirmLabel="Unfollow"
        destructive
        onConfirm={async () => { const run = confirmUnfollow; setConfirmUnfollow(null); await run?.(); }}
        onCancel={() => setConfirmUnfollow(null)}
      />
      <StatusBar barStyle={statusBarStyle} backgroundColor={colors.surface} />
      <View style={SettingsStyle.header}>
        <TouchableOpacity style={SettingsStyle.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={SettingsStyle.headerTitle}>{profile?.isMe ? "My reels" : "Profile"}</Text>
      </View>

      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 60 }} />
        ) : error ? (
          <View style={ReelStyles.locked}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
            <Text style={ReelStyles.lockedText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={reels}
            keyExtractor={(r) => r._id}
            numColumns={3}
            ListHeaderComponent={header}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            renderItem={({ item, index }) => (
              <TouchableOpacity style={ReelStyles.gridTile} onPress={() => openReel(index)} activeOpacity={0.8}>
                {/* Photo reels show the photo; videos show a frame from the video */}
                {isPhotoReel(item)
                  ? <ExpoImage source={{ uri: reelMediaUrl(item) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  : <VideoTileThumb uri={reelMediaUrl(item)} />}
                <Ionicons name={isPhotoReel(item) ? ((item.photos?.length ?? 1) > 1 ? "albums" : "image") : "play"} size={16} color="#FFFFFF" style={ReelStyles.gridPlay} />
                {!!item.caption && <Text style={ReelStyles.gridCaption} numberOfLines={2}>{item.caption}</Text>}
              </TouchableOpacity>
            )}
            ListEmptyComponent={profile && (
              <View style={ReelStyles.locked}>
                <Ionicons name={profile.canViewReels ? "videocam-outline" : "lock-closed-outline"} size={40} color={colors.textMuted} />
                <Text style={ReelStyles.lockedText}>
                  {!profile.canViewReels
                    ? `Follow ${displayName(profile.user)} to see their reels`
                    : profile.isMe ? "You haven't posted any reels yet" : "No reels yet"}
                </Text>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
