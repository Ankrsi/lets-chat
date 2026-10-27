import {
  compactCount, countReelShare, displayName, followUser, isPhotoReel, likeReel, Reel, reelMediaUrl, reelPhotos, unlikeReel,
} from "@/utils/reels";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, FlatList, Pressable, RefreshControl, Share, StyleSheet, Text, TouchableOpacity, View, ViewToken } from "react-native";
import { ReelStyles } from "../styles";
import ReelCommentsSheet from "./ReelCommentsSheet";

const DOUBLE_TAP_MS = 260;

const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};

function PhotoReel({ uri, height }: { uri: string; height: number }) {
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState<number | null>(null); // photo width / height
  const screenRatio = width && height ? width / height : 9 / 16;
  const fills = ratio !== null && Math.abs(ratio - screenRatio) / screenRatio < 0.3;

  return (
    <View style={ReelStyles.video} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {!fills && (
        <>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.35)" }]} />
        </>
      )}
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit={fills ? "cover" : "contain"}
        onLoad={(e) => e.source.width && e.source.height && setRatio(e.source.width / e.source.height)}
        transition={150}
      />
    </View>
  );
}

function PhotoCarousel({ uris, height, onTap }: { uris: string[]; height: number; onTap: () => void }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  if (uris.length === 1) {
    return (
      <Pressable style={ReelStyles.video} onPress={onTap}>
        <PhotoReel uri={uris[0]} height={height} />
      </Pressable>
    );
  }
  return (
    <View style={ReelStyles.video} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <FlatList
          data={uris}
          keyExtractor={(uri, i) => `${i}-${uri}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          initialNumToRender={2}
          windowSize={3}
          renderItem={({ item }) => (
            <Pressable style={{ width, height }} onPress={onTap}>
              <PhotoReel uri={item} height={height} />
            </Pressable>
          )}
        />
      )}
      <View style={ReelStyles.photoCounter} pointerEvents="none">
        <Text style={ReelStyles.photoCounterText}>{index + 1}/{uris.length}</Text>
      </View>
      <View style={ReelStyles.photoDots} pointerEvents="none">
        {uris.map((uri, i) => (
          <View key={`${i}-${uri}`} style={[ReelStyles.photoDot, i === index && ReelStyles.photoDotActive]} />
        ))}
      </View>
    </View>
  );
}

const ReelItem = React.memo(function ReelItem({ reel, height, playing, loaded, muted, commentCount, onToggleMute, onAuthorPress, onDelete, onOpenComments }: {
  reel: Reel;
  muted: boolean;
  onToggleMute: () => void;
  height: number;
  playing: boolean;
  loaded: boolean;
  commentCount: number;
  onAuthorPress?: (reel: Reel) => void;
  onDelete?: (reel: Reel) => void;
  onOpenComments: (reel: Reel) => void;
}) {
  const photo = isPhotoReel(reel);
  // Cached on disk, so scrolling back to a reel doesn't download it again
  const player = useVideoPlayer(loaded && !photo ? { uri: reelMediaUrl(reel), useCaching: true } : null, (p) => {
    p.loop = true;
    p.muted = muted;
  });
  const [pausedByUser, setPausedByUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [captionOpen, setCaptionOpen] = useState(false);
  // Suggested reels (from people I don't follow) get a Follow button
  const [followed, setFollowed] = useState(false);
  const follow = async () => {
    setFollowed(true);
    try {
      await followUser(reel.author.phone);
    } catch {
      setFollowed(false);
    }
  };

  // Likes: shown at once, then corrected by the server's count
  const [liked, setLiked] = useState(!!reel.likedByMe);
  const [likeCount, setLikeCount] = useState(reel.likeCount ?? 0);
  const [shareCount, setShareCount] = useState(reel.shareCount ?? 0);
  const likeBusy = useRef(false);
  const heart = useRef(new Animated.Value(0)).current;

  const setLike = async (next: boolean) => {
    if (likeBusy.current || next === liked) return;
    likeBusy.current = true;
    setLiked(next);
    setLikeCount((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      setLikeCount(next ? await likeReel(reel._id) : await unlikeReel(reel._id));
    } catch {
      setLiked(!next); // put it back
      setLikeCount((n) => Math.max(0, n + (next ? -1 : 1)));
    } finally {
      likeBusy.current = false;
    }
  };

  const burstHeart = () => {
    heart.setValue(0);
    Animated.sequence([
      Animated.spring(heart, { toValue: 1, useNativeDriver: true, friction: 4 }),
      Animated.timing(heart, { toValue: 0, duration: 250, delay: 350, useNativeDriver: true }),
    ]).start();
  };

  // Single tap: pause / play (videos). Double tap: like, with a heart burst.
  const lastTap = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (singleTapTimer.current) clearTimeout(singleTapTimer.current); }, []);
  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      burstHeart();
      setLike(true);
      return;
    }
    lastTap.current = now;
    if (photo) return;
    singleTapTimer.current = setTimeout(() => setPausedByUser((v) => !v), DOUBLE_TAP_MS);
  };

  const share = async () => {
    try {
      const url = reelMediaUrl(reel);
      const who = reel.isMine ? "my" : `${displayName(reel.author)}'s`;
      const message = `${reel.caption ? `${reel.caption}\n\n` : ""}Check out ${who} reel: ${url}`;
      const result = await Share.share({ message, url });
      if (result.action === Share.sharedAction) {
        setShareCount((n) => n + 1);
        countReelShare(reel._id).then(setShareCount).catch(() => undefined);
      }
    } catch (err) {
      console.info("share reel failed", err);
    }
  };

  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => setLoading(status === "loading"));
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  // Upcoming reels fetch only their first seconds (instant start without spending data on
  // videos the user may skip); the one on screen buffers further ahead
  useEffect(() => {
    if (photo) return;
    player.bufferOptions = playing
      ? { preferredForwardBufferDuration: 20, minBufferForPlayback: 2 }
      : { preferredForwardBufferDuration: 4, minBufferForPlayback: 1 };
  }, [photo, playing, player]);

  // Play only while on screen; scrolling away resets a manual pause
  useEffect(() => {
    if (photo) return;
    if (playing && !pausedByUser) player.play();
    else player.pause();
  }, [photo, playing, pausedByUser, player]);
  useEffect(() => {
    if (!playing) setPausedByUser(false);
  }, [playing]);

  const author = reel.author;
  return (
    <View style={[ReelStyles.item, { height }]}>
      {photo ? (
        <PhotoCarousel uris={reelPhotos(reel)} height={height} onTap={onTap} />
      ) : (
        <VideoView
          player={player}
          style={ReelStyles.video}
          // contain: the whole frame stays on screen (cover cropped the sides on tall phones)
          contentFit="contain"
          nativeControls={false}
        />
      )}
      {/* Videos: a tap layer over the media, since the native video view swallows touches on Android.
          Photos handle taps themselves, so the carousel can still be swiped. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onTap} pointerEvents={photo ? "none" : "auto"}>
        {!photo && loading && playing && (
          <View style={ReelStyles.center} pointerEvents="none"><ActivityIndicator color="#FFFFFF" size="large" /></View>
        )}
        {pausedByUser && (
          <View style={ReelStyles.center} pointerEvents="none">
            <Ionicons name="play" size={72} color="#FFFFFF" style={ReelStyles.pausedIcon} />
          </View>
        )}
        <View style={ReelStyles.center} pointerEvents="none">
          <Animated.View style={{ opacity: heart, transform: [{ scale: heart.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.15] }) }] }}>
            <Ionicons name="heart" size={110} color="#FF3B5C" style={ReelStyles.pausedIcon} />
          </Animated.View>
        </View>
      </Pressable>

      {!photo && (
        <TouchableOpacity style={ReelStyles.muteBtn} onPress={onToggleMute} hitSlop={10} accessibilityLabel={muted ? "Turn sound on" : "Turn sound off"}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={18} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Author + caption */}
      <View style={ReelStyles.bottomInfo}>
        {reel.suggested && <Text style={[ReelStyles.suggestedLabel, ReelStyles.shadow]}>Suggested for you</Text>}
        <View style={ReelStyles.authorLine}>
          <TouchableOpacity style={ReelStyles.authorRow} onPress={() => onAuthorPress?.(reel)} disabled={!onAuthorPress} activeOpacity={0.7}>
            <View style={ReelStyles.authorAvatar}>
              {author?.profile_image
                ? <Image source={{ uri: author.profile_image }} style={{ width: 36, height: 36 }} />
                : <Ionicons name="person" size={18} color="#BBBBBB" />}
            </View>
            <View>
              <Text style={[ReelStyles.authorName, ReelStyles.shadow]}>{reel.isMine ? "You" : displayName(author)}</Text>
              {author?.username && <Text style={[ReelStyles.authorHandle, ReelStyles.shadow]}>@{author.username}</Text>}
            </View>
          </TouchableOpacity>
          {reel.suggested && (
            <TouchableOpacity style={[ReelStyles.reelFollowBtn, followed && ReelStyles.reelFollowBtnDone]} onPress={follow} disabled={followed}>
              <Text style={ReelStyles.reelFollowText}>{followed ? "Following" : "Follow"}</Text>
            </TouchableOpacity>
          )}
        </View>
        {!!reel.caption && (
          <Text style={[ReelStyles.caption, ReelStyles.shadow]} numberOfLines={captionOpen ? undefined : 2} onPress={() => setCaptionOpen((v) => !v)}>
            {reel.caption}
          </Text>
        )}
        <Text style={[ReelStyles.time, ReelStyles.shadow]}>{timeAgo(reel.createdAt)}</Text>
      </View>

      {/* Actions */}
      <View style={ReelStyles.sideActions}>
        <TouchableOpacity style={ReelStyles.sideBtn} onPress={() => setLike(!liked)} hitSlop={10} accessibilityLabel={liked ? "Unlike" : "Like"}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={32} color={liked ? "#FF3B5C" : "#FFFFFF"} style={ReelStyles.shadow} />
          <Text style={[ReelStyles.sideText, ReelStyles.shadow]}>{compactCount(likeCount)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ReelStyles.sideBtn} onPress={() => onOpenComments(reel)} hitSlop={10} accessibilityLabel="Comments">
          <Ionicons name="chatbubble-outline" size={29} color="#FFFFFF" style={ReelStyles.shadow} />
          <Text style={[ReelStyles.sideText, ReelStyles.shadow]}>{compactCount(commentCount)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ReelStyles.sideBtn} onPress={share} hitSlop={10} accessibilityLabel="Share">
          <Ionicons name="paper-plane-outline" size={29} color="#FFFFFF" style={ReelStyles.shadow} />
          <Text style={[ReelStyles.sideText, ReelStyles.shadow]}>{shareCount ? compactCount(shareCount) : "Share"}</Text>
        </TouchableOpacity>
        {reel.isMine && onDelete && (
          <TouchableOpacity style={ReelStyles.sideBtn} onPress={() => onDelete(reel)} hitSlop={10}>
            <Ionicons name="trash-outline" size={28} color="#FFFFFF" />
            <Text style={[ReelStyles.sideText, ReelStyles.shadow]}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

export default function ReelsPager({
  reels, initialIndex = 0, focused, loadingMore, refreshing, onRefresh, onEndReached, onAuthorPress, onDelete,
}: {
  reels: Reel[];
  initialIndex?: number;
  focused: boolean; // false when another screen is on top: everything pauses
  loadingMore?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  onAuthorPress?: (reel: Reel) => void;
  onDelete?: (reel: Reel) => void;
}) {
  const [height, setHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  // Comments sheet (pauses the reel), and comment counts updated from it
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [muted, setMuted] = useState(false);
  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const openComments = useCallback((reel: Reel) => setCommentsFor(reel._id), []);
  const onCommentCount = useCallback((id: string, n: number) => setCommentCounts((prev) => (prev[id] === n ? prev : { ...prev, [id]: n })), []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.index != null) setActiveIndex(first.index);
  }).current;

  const renderItem = useCallback(({ item, index }: { item: Reel; index: number }) => (
    <ReelItem
      reel={item}
      height={height}
      playing={focused && index === activeIndex && !commentsFor}
      // The one on screen and the next two hold players; the previous one replays from the cache
      loaded={focused && index >= activeIndex && index <= activeIndex + 2}
      muted={muted}
      onToggleMute={toggleMute}
      commentCount={commentCounts[item._id] ?? item.commentCount ?? 0}
      onAuthorPress={onAuthorPress}
      onDelete={onDelete}
      onOpenComments={openComments}
    />
  ), [height, focused, activeIndex, muted, toggleMute, commentsFor, commentCounts, onAuthorPress, onDelete, openComments]);

  return (
    <View style={ReelStyles.pager} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
      {height > 0 && (
        <FlatList
          data={reels}
          keyExtractor={(r) => r._id}
          renderItem={renderItem}
          pagingEnabled
          snapToInterval={height}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          initialScrollIndex={Math.min(initialIndex, Math.max(reels.length - 1, 0))}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
          // Mount the visible reel and two either side (only those ahead get a video player)
          windowSize={5}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          onEndReached={onEndReached}
          onEndReachedThreshold={2}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" colors={["#6366F1"]} /> : undefined}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 20 }} /> : null}
        />
      )}
      <ReelCommentsSheet reelId={commentsFor} onClose={() => setCommentsFor(null)} onCountChange={onCommentCount} />
    </View>
  );
}
