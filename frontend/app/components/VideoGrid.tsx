import { colors } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { createVideoPlayer, useVideoPlayer, VideoView } from "expo-video";
import type { VideoThumbnail } from "expo-video";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, Modal, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MAX_WIDTH = Dimensions.get("window").width * 0.62;
const GAP = 3;
const RADIUS = 14;

type VideoItem = { name?: string; url?: string } | string;

interface Props {
    urls: VideoItem[];
    /** Long press on the card (message options) */
    onLongPress?: () => void;
}

/* ---------------- preview (thumbnail + duration) ---------------- */

type Preview = { thumb: VideoThumbnail | null; duration: number | null };

// One preview per URL for the whole session: scrolling back doesn't reload videos
const previewCache = new Map<string, Promise<Preview>>();

/**
 * Loads just enough of the video for a first-frame thumbnail and its duration, using a
 * short-lived player (no view attached), then releases it.
 */
function loadPreview(uri: string): Promise<Preview> {
    const cached = previewCache.get(uri);
    if (cached) return cached;

    const promise = new Promise<Preview>((resolve, reject) => {
        const player = createVideoPlayer(uri);
        player.muted = true;
        let settled = false;
        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            loadSub.remove();
            statusSub.remove();
            fn();
            player.release();
        };
        const timer = setTimeout(() => finish(() => reject(new Error("Video preview timed out"))), 20000);

        const loadSub = player.addListener("sourceLoad", async ({ duration }) => {
            try {
                // A frame slightly in, since the very first frame is often black
                const at = duration > 1 ? 0.5 : 0;
                const [thumb] = await player.generateThumbnailsAsync([at], { maxWidth: 480 });
                finish(() => resolve({ thumb: thumb ?? null, duration: duration || null }));
            } catch {
                finish(() => resolve({ thumb: null, duration: duration || null }));
            }
        });
        const statusSub = player.addListener("statusChange", ({ status, error }) => {
            if (status === "error") finish(() => reject(new Error(error?.message || "Video failed to load")));
        });
    });

    previewCache.set(uri, promise);
    promise.catch(() => previewCache.delete(uri)); // allow a retry next time it's shown
    return promise;
}

const formatDuration = (seconds: number | null) => {
    if (!seconds || !isFinite(seconds)) return null;
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

/* ---------------- full-screen player ---------------- */

// Mounted only while open, so its player exists only while watching
function FullscreenVideo({ uri, onClose }: { uri: string; onClose: () => void }) {
    const insets = useSafeAreaInsets();
    const player = useVideoPlayer(uri, (p) => {
        p.loop = false;
        p.play();
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const sub = player.addListener("statusChange", ({ status }) => setLoading(status === "loading"));
        return () => sub.remove();
    }, [player]);

    return (
        <View style={styles.fullscreen}>
            <StatusBar barStyle="light-content" backgroundColor="#000000" />
            <VideoView style={StyleSheet.absoluteFill} player={player} nativeControls allowsPictureInPicture contentFit="contain" />
            {loading && (
                <View style={styles.center} pointerEvents="none">
                    <ActivityIndicator color="#FFFFFF" size="large" />
                </View>
            )}
            <TouchableOpacity
                style={[styles.closeBtn, { top: insets.top + 10 }]}
                onPress={onClose}
                hitSlop={10}
                accessibilityLabel="Close video"
            >
                <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
        </View>
    );
}

/* ---------------- one tile ---------------- */

function VideoCell({ uri, style, overlay, onLongPress }: { uri: string; style: any; overlay?: React.ReactNode; onLongPress?: () => void }) {
    const [preview, setPreview] = useState<Preview | null>(null);
    const [failed, setFailed] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let alive = true;
        setFailed(false);
        loadPreview(uri)
            .then((p) => alive && setPreview(p))
            .catch((err) => {
                console.info("chat video preview failed", uri, err?.message);
                if (alive) setFailed(true);
            });
        return () => { alive = false; };
    }, [uri]);

    const duration = formatDuration(preview?.duration ?? null);

    if (failed) {
        return (
            <View style={[style, styles.tile, styles.failed]}>
                <Ionicons name="videocam-off-outline" size={26} color={colors.textMuted} />
                <Text style={styles.failedText}>Video unavailable</Text>
                {overlay}
            </View>
        );
    }

    return (
        <>
            <TouchableOpacity style={[style, styles.tile]} activeOpacity={0.85} onPress={() => setOpen(true)} onLongPress={onLongPress} accessibilityLabel="Play video">
                {preview?.thumb
                    ? <Image source={preview.thumb} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                    : !preview && <ActivityIndicator color="rgba(255,255,255,0.7)" style={StyleSheet.absoluteFill} />}

                {/* Bottom shade so the duration stays readable on bright frames */}
                <LinearGradient colors={["transparent", "rgba(0,0,0,0.55)"]} style={styles.shade} pointerEvents="none" />

                <View style={styles.center} pointerEvents="none">
                    <View style={styles.playBtn}>
                        <Ionicons name="play" size={24} color="#FFFFFF" style={{ marginLeft: 3 }} />
                    </View>
                </View>

                {duration && (
                    <View style={styles.durationPill} pointerEvents="none">
                        <Ionicons name="videocam" size={11} color="#FFFFFF" />
                        <Text style={styles.durationText}>{duration}</Text>
                    </View>
                )}
                {overlay}
            </TouchableOpacity>

            <Modal visible={open} animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
                {open && <FullscreenVideo uri={uri} onClose={() => setOpen(false)} />}
            </Modal>
        </>
    );
}

/* ---------------- grid ---------------- */

const VideoGrid: React.FC<Props> = ({ urls = [], onLongPress }) => {
    const count = urls.length;
    const uriOf = (item: VideoItem) => (item as any)?.url || (item as string);

    const render = (item: VideoItem, style: any, index: number, overlay?: React.ReactNode) => (
        <VideoCell key={`${index}-${uriOf(item)}`} uri={uriOf(item)} style={style} overlay={overlay} onLongPress={onLongPress} />
    );

    if (count === 1) return render(urls[0], styles.single, 0);

    if (count === 2) {
        return (
            <View style={styles.row}>
                {render(urls[0], [styles.half, { borderTopRightRadius: 4, borderBottomRightRadius: 4 }], 0)}
                {render(urls[1], [styles.half, { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }], 1)}
            </View>
        );
    }

    if (count === 3) {
        return (
            <View style={{ gap: GAP }}>
                <View style={styles.row}>
                    {render(urls[0], styles.half, 0)}
                    {render(urls[1], styles.half, 1)}
                </View>
                {render(urls[2], styles.full, 2)}
            </View>
        );
    }

    // 4+: first four, the last one shows how many more
    const display = urls.slice(0, 4);
    return (
        <View style={{ gap: GAP }}>
            <View style={styles.row}>
                {render(display[0], styles.half, 0)}
                {render(display[1], styles.half, 1)}
            </View>
            <View style={styles.row}>
                {render(display[2], styles.half, 2)}
                {render(
                    display[3],
                    styles.half,
                    3,
                    count > 4 ? (
                        <View style={styles.moreOverlay} pointerEvents="none">
                            <Text style={styles.moreText}>+{count - 4}</Text>
                        </View>
                    ) : null,
                )}
            </View>
        </View>
    );
};

export default VideoGrid;

const styles = StyleSheet.create({
    row: { flexDirection: "row", gap: GAP },
    single: { width: MAX_WIDTH, height: MAX_WIDTH * 1.15, borderRadius: RADIUS },
    half: { width: (MAX_WIDTH - GAP) / 2, height: (MAX_WIDTH - GAP) / 2, borderRadius: 10 },
    full: { width: MAX_WIDTH, height: MAX_WIDTH * 0.6, borderRadius: 10 },

    tile: { backgroundColor: "#111827", overflow: "hidden", justifyContent: "center", alignItems: "center" },
    shade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "45%" },
    center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
    playBtn: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: "rgba(15,23,42,0.45)",
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.7)",
        alignItems: "center",
        justifyContent: "center",
    },
    durationPill: {
        position: "absolute",
        left: 8,
        bottom: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: "rgba(0,0,0,0.45)",
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 3,
    },
    durationText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },

    failed: { backgroundColor: colors.surfaceAlt, gap: 6 },
    failedText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },

    moreOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(15,23,42,0.6)",
        justifyContent: "center",
        alignItems: "center",
    },
    moreText: { color: "#FFFFFF", fontSize: 26, fontWeight: "800" },

    fullscreen: { flex: 1, backgroundColor: "#000000" },
    closeBtn: {
        position: "absolute",
        left: 14,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(0,0,0,0.5)",
        alignItems: "center",
        justifyContent: "center",
    },
});
