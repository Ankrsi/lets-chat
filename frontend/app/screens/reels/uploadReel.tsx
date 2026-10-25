import { ReelStyles, SettingsStyle } from "@/app/styles";
import { apiErrorMessage } from "@/utils/api";
import { markFeedStale, uploadReel } from "@/utils/reels";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Switch, Linking, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import type { VideoThumbnail } from "expo-video";
import { colors } from "@/theme";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { formatBytes } from "@/utils/media";
import { File } from "expo-file-system";
import { SafeAreaView } from "react-native-safe-area-context";

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_PHOTO_BYTES = 100 * 1024 * 1024;
const MAX_SECONDS = 3 * 60;
const MAX_CAPTION = 2200;
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/3gpp"];
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

type PickedMedia = { kind: "video" | "image"; uri: string; mimeType: string; duration: number | null; size: number | null };

/** A problem with the picked file (or the upload), shown in the themed dialog */
type Notice = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  message: string;
  action: "pick" | "settings" | "retry" | null;
};

const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// The picker sometimes leaves out the type; fall back on the file extension
const guessMimeType = (asset: ImagePicker.ImagePickerAsset) => {
  if (asset.mimeType) return asset.mimeType;
  const ext = asset.uri.split("?")[0].split(".").pop()?.toLowerCase();
  if (asset.type === "video") return ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : ext === "3gp" ? "video/3gpp" : "video/mp4";
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "heic" ? "image/heic" : "image/jpeg";
};

/**
 * Looping preview of the picked video, with sound (tap the speaker to mute). If the device
 * can't play the file, a still frame shows instead.
 */
function VideoPreview({ uri }: { uri: string }) {
  const [thumb, setThumb] = useState<VideoThumbnail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [muted, setMuted] = useState(false);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    let alive = true;
    const start = () => {
      if (!alive) return;
      setState("ready");
      player.play();
    };
    // One player only: a second one (for a thumbnail) can take the phone's only 4K decoder.
    // If playback fails, fall back to a still frame.
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") start();
      else if (status === "error" && alive) {
        setState("error");
        player.generateThumbnailsAsync([0.5], { maxWidth: 720 })
          .then(([t]) => alive && t && setThumb(t))
          .catch(() => undefined);
      }
    });
    if (player.status === "readyToPlay") start();
    return () => { alive = false; sub.remove(); };
  }, [player, uri]);

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {!!thumb && <Image source={thumb} style={StyleSheet.absoluteFill} contentFit="cover" />}
      {/* Default surface: textureView stays blank for phone-recorded 4K (rotated) video */}
      {state !== "error" && (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      )}
      {state === "loading" && !thumb && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}
      {state === "error" && !thumb && (
        <View style={[StyleSheet.absoluteFill, styles.center, { padding: 24 }]}>
          <Ionicons name="film-outline" size={40} color="#888888" />
          <Text style={[ReelStyles.pickHint, { textAlign: "center" }]}>Preview is not available for this video, but it can still be posted.</Text>
        </View>
      )}
      {state === "ready" && (
        <TouchableOpacity
          style={styles.soundBtn}
          onPress={() => setMuted((m) => !m)}
          hitSlop={10}
          accessibilityLabel={muted ? "Turn sound on" : "Mute"}
        >
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function UploadReelScreen() {
  const router = useRouter();
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<"optimizing" | "uploading">("uploading");
  const uploading = progress !== null;
  // Videos only: compress (about 720p, like chat apps) before uploading
  const [optimize, setOptimize] = useState(true);
  const [notice, setNoticeNow] = useState<Notice | null>(null);
  // Opened a moment later: a dialog shown while the picker is still handing back can be dropped on Android
  const setNotice = (n: Notice | null) => {
    if (n) setTimeout(() => setNoticeNow(n), 350);
    else setNoticeNow(null);
  };

  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice({
        icon: "lock-closed-outline",
        title: "Allow access to photos and videos",
        message: "Allow access to your photos and videos to post a reel.",
        action: permission.canAskAgain ? "pick" : "settings",
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      videoMaxDuration: MAX_SECONDS,
      quality: 0.9,
    });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;

    const kind: PickedMedia["kind"] = asset.type === "video" ? "video" : "image";
    const mimeType = guessMimeType(asset);
    if (!(kind === "video" ? VIDEO_TYPES : PHOTO_TYPES).includes(mimeType)) {
      setNotice({
        icon: kind === "video" ? "film-outline" : "image-outline",
        title: kind === "video" ? "Unsupported video" : "Unsupported photo",
        message: kind === "video" ? "Choose an MP4, MOV, WebM or 3GP video." : "Choose a JPG, PNG, WebP or HEIC photo.",
        action: "pick",
      });
      return;
    }
    // The picker can leave out the size, so read it from the file
    let size = asset.fileSize ?? null;
    if (!size) {
      try { size = new File(asset.uri).size || null; } catch { size = null; }
    }
    const maxBytes = kind === "video" ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
    // A big video is accepted when it will be optimized; its size is checked again after compressing
    const willOptimize = kind === "video" && optimize;
    if (size && size > maxBytes && !willOptimize) {
      setNotice({
        icon: "cloud-upload-outline",
        title: kind === "video" ? "Video too large" : "Photo too large",
        message: kind === "video"
          ? `This video is ${formatBytes(size)}. Videos can be up to 200 MB — turn on "Optimize size" or pick a shorter clip.`
          : `This photo is ${formatBytes(size)}. Photos can be up to 100 MB.`,
        action: "pick",
      });
      return;
    }
    const seconds = kind === "video" && asset.duration ? Math.round(asset.duration / 1000) : null; // picker reports ms
    if (seconds && seconds > MAX_SECONDS) {
      setNotice({
        icon: "time-outline",
        title: "Video too long",
        message: `This video is ${formatDuration(seconds)} long. Reels can be up to 3:00 — trim it and try again.`,
        action: "pick",
      });
      return;
    }
    setMedia({ kind, uri: asset.uri, mimeType, duration: seconds, size });
  };

  const share = async () => {
    if (!media || uploading) return;
    setProgress(0);
    try {
      let upload = media;
      if (media.kind === "video" && optimize) {
        setPhase("optimizing");
        // Loaded here so an app build without the native module still opens this screen
        let VideoCompressor: typeof import("react-native-compressor").Video;
        try {
          VideoCompressor = require("react-native-compressor").Video;
        } catch {
          throw new Error("Video optimizing needs the latest app build. Turn off \"Optimize size\" or update the app.");
        }
        const uri = await VideoCompressor.compress(media.uri, { compressionMethod: "auto" }, (p) => setProgress(Math.round(p * 100)));
        let size: number | null = null;
        try { size = new File(uri).size || null; } catch { size = null; }
        // Keep the original if compressing didn't make it smaller
        if (!(media.size && size && size >= media.size)) upload = { ...media, uri, mimeType: "video/mp4", size };
      }
      if (upload.size && upload.size > (upload.kind === "video" ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES)) {
        setProgress(null);
        setNotice({
          icon: "cloud-upload-outline",
          title: "Video too large",
          message: `Even optimized, this video is ${formatBytes(upload.size)}. Videos can be up to 200 MB — pick a shorter clip.`,
          action: "pick",
        });
        return;
      }
      setPhase("uploading");
      setProgress(0);
      await uploadReel(upload, caption.trim(), setProgress);
      markFeedStale();
      router.back();
    } catch (err) {
      setProgress(null);
      setNotice({ icon: "alert-circle-outline", title: "Couldn't post reel", message: apiErrorMessage(err), action: "retry" });
    }
  };

  const runNoticeAction = async () => {
    const action = notice?.action;
    setNotice(null);
    // Let the dialog close before the picker / settings take over the screen
    await new Promise((r) => setTimeout(r, 200));
    if (action === "pick") pickMedia();
    else if (action === "settings") Linking.openSettings();
    else if (action === "retry") share();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000000" }}>
      <ConfirmDialog
        visible={!!notice}
        icon={notice?.icon}
        title={notice?.title ?? ""}
        message={notice?.message}
        confirmLabel={notice?.action === "settings" ? "Open Settings" : notice?.action === "retry" ? "Try again" : notice?.action === "pick" ? "Choose another" : "OK"}
        cancelLabel={notice?.action ? "Cancel" : null}
        onConfirm={notice?.action ? runNoticeAction : () => setNotice(null)}
        onCancel={() => setNotice(null)}
      />
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View style={[SettingsStyle.header, { backgroundColor: "#000000" }]}>
        <TouchableOpacity style={SettingsStyle.backBtn} onPress={() => router.back()} disabled={uploading}>
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={[SettingsStyle.headerTitle, { color: "#FFFFFF" }]}>New reel</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            // No rounded clipping once something is picked: on Android the clipped box draws its background
            // over the photo/video inside it. The photo rounds its own corners instead.
            style={[ReelStyles.uploadPreview, !media && ReelStyles.pickBox, !!media && { borderRadius: 0, overflow: "visible", backgroundColor: "transparent" }]}
            onPress={pickMedia}
            disabled={uploading}
            activeOpacity={0.85}
          >
            {media?.kind === "video" && <VideoPreview key={media.uri} uri={media.uri} />}
            {media?.kind === "image" && <Image source={{ uri: media.uri }} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} contentFit="cover" />}
            {!media && (
              <>
                <View style={{ flexDirection: "row", gap: 14 }}>
                  <Ionicons name="image-outline" size={44} color="#888888" />
                  <Ionicons name="videocam-outline" size={44} color="#888888" />
                </View>
                <Text style={ReelStyles.pickText}>Choose a photo or video</Text>
                {/* Two short lines so the hint stays inside the box on narrow phones */}
                <Text style={[ReelStyles.pickHint, styles.hint]}>Photos up to 100 MB</Text>
                <Text style={[ReelStyles.pickHint, styles.hint, { marginTop: 2 }]}>Videos up to 3 min · 200 MB</Text>
              </>
            )}
          </TouchableOpacity>
          {media && !uploading && (
            <TouchableOpacity onPress={pickMedia} style={styles.selectedRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={[ReelStyles.pickHint, { marginTop: 0, color: "#CCCCCC" }]}>
                {media.kind === "video" ? "Video" : "Photo"} selected
                {media.duration ? `  ·  ${formatDuration(media.duration)}` : ""}
                {media.size ? `  ·  ${formatBytes(media.size)}` : ""}
              </Text>
              <Text style={[ReelStyles.pickHint, { marginTop: 0, color: colors.primaryMuted, fontWeight: "700" }]}>Change</Text>
            </TouchableOpacity>
          )}

          {media?.kind === "video" && (
            <View style={styles.optimizeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optimizeTitle}>Optimize size</Text>
                <Text style={styles.optimizeSub}>
                  {optimize
                    ? "Compresses to about 720p before upload — faster to post and to watch"
                    : media.size && media.size > MAX_VIDEO_BYTES
                      ? "Needed for videos over 200 MB"
                      : "Uploads the original quality"}
                </Text>
              </View>
              <Switch
                value={optimize}
                onValueChange={(on) => {
                  // Turning it off isn't possible for a video that's over the limit
                  if (!on && media.size && media.size > MAX_VIDEO_BYTES) {
                    setNotice({
                      icon: "cloud-upload-outline",
                      title: "Video too large",
                      message: `This video is ${formatBytes(media.size)}. Videos over 200 MB have to be optimized.`,
                      action: null,
                    });
                    return;
                  }
                  setOptimize(on);
                }}
                disabled={uploading}
                trackColor={{ false: "#3A3A3A", true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          )}

          <TextInput
            style={ReelStyles.captionInput}
            value={caption}
            onChangeText={setCaption}
            placeholder="Write a caption…"
            placeholderTextColor="#777777"
            multiline
            maxLength={MAX_CAPTION}
            editable={!uploading}
          />
          <Text style={ReelStyles.captionCount}>{caption.length}/{MAX_CAPTION}</Text>

          {uploading && (
            <>
              <View style={ReelStyles.progressTrack}>
                <View style={[ReelStyles.progressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={ReelStyles.progressText}>
                {phase === "optimizing" ? `Optimizing video… ${progress}%` : progress! < 100 ? `Uploading… ${progress}%` : "Publishing…"}
              </Text>
            </>
          )}

          <TouchableOpacity
            style={[ReelStyles.shareBtn, (!media || uploading) && ReelStyles.disabled]}
            onPress={share}
            disabled={!media || uploading}
          >
            <Text style={ReelStyles.shareText}>Share to followers</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  hint: { textAlign: "center", paddingHorizontal: 16 },
  soundBtn: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  optimizeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#1A1A1A",
  },
  optimizeTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  optimizeSub: { color: "#8A8A8A", fontSize: 12, marginTop: 2 },
  selectedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 },
});
