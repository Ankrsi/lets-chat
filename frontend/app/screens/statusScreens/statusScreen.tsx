import { statusStyles } from "@/app/styles";
import { ContactContext } from "@/contexts/FriendContactContext";
import { colors } from "@/theme";
import { CHATAPI, apiErrorMessage } from "@/utils/api";
import { getGlobalUsername } from "@/utils/globalRefs";
import { MAX_UPLOAD_BYTES, MediaItem, mediaFromPickerAsset } from "@/utils/media";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from "expo-router";
import React, { useCallback, useContext, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Linking,
    RefreshControl,
    ScrollView,
    StatusBar,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import StatusViewer, { statusTimeAgo } from "@/app/components/StatusViewer";
import BottomTabBar from "@/app/components/BottomTabBar";
import MediaPreviewModal from "@/app/components/MediaPreviewModal";

const DEFAULT_AVATAR = require("../../../assets/images/user.png");

const latestOf = (status: any) => status?.stories?.[status.stories.length - 1];

export default function StatusScreen() {
    const username = getGlobalUsername();
    const { viewName } = useContext(ContactContext);
    const [myStatus, setMyStatus] = useState<any>(null);
    const [recentUpdates, setRecentUpdates] = useState<any[]>([]);
    const [viewedUpdates, setViewedUpdates] = useState<any[]>([]);
    const [viewerUser, setViewerUser] = useState<any>(null);
    const [loaded, setLoaded] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    // Picked media waiting in the preview, and the upload in progress
    const [pending, setPending] = useState<MediaItem[]>([]);
    const [captions, setCaptions] = useState<string[]>([]);
    const [posting, setPosting] = useState(false);

    const fetchStatuses = useCallback(async () => {
        try {
            const res = await CHATAPI.get("/chats/getAllStatus");
            const { myStatus: my, recent, viewed } = (res.data ?? []).reduce(
                (acc: any, status: any) => {
                    if (!status?.stories?.length) return acc;
                    if (status.phone === username) {
                        acc.myStatus = status;
                    } else {
                        const hasUnseenStory = status.stories.some(
                            (story: any) => !(story.viewers ?? []).some((viewer: any) => viewer.phone === username)
                        );
                        (hasUnseenStory ? acc.recent : acc.viewed).push(status);
                    }
                    return acc;
                },
                { myStatus: null, recent: [], viewed: [] }
            );
            // Newest first
            const byLatest = (a: any, b: any) => new Date(latestOf(b)?.createdAt).getTime() - new Date(latestOf(a)?.createdAt).getTime();
            setMyStatus(my);
            setRecentUpdates(recent.sort(byLatest));
            setViewedUpdates(viewed.sort(byLatest));
        } catch (error) {
            console.info("Failed to fetch statuses:", error);
        } finally {
            setLoaded(true);
        }
    }, [username]);

    useFocusEffect(useCallback(() => { fetchStatuses(); }, [fetchStatuses]));

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchStatuses();
        setRefreshing(false);
    };

    const openPreview = (assets: ImagePicker.ImagePickerAsset[]) => {
        const items = assets.map(mediaFromPickerAsset);
        const ok = items.filter((it) => !(it.size && it.size > MAX_UPLOAD_BYTES));
        if (ok.length < items.length) Alert.alert("File too large", "Status updates can be up to 100 MB each.");
        if (!ok.length) return;
        setPending(ok);
        setCaptions(ok.map(() => ""));
    };

    const pickFromGallery = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsMultipleSelection: true,
            selectionLimit: 10,
            quality: 0.9,
        });
        if (!result.canceled && result.assets?.length) openPreview(result.assets);
    };

    const takeWithCamera = async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
            Alert.alert(
                "Camera permission needed",
                "Allow camera access to post a photo.",
                perm.canAskAgain ? [{ text: "OK" }] : [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }],
            );
            return;
        }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
        if (!result.canceled && result.assets?.length) openPreview(result.assets);
    };

    const closePreview = () => {
        setPending([]);
        setCaptions([]);
    };

    const postStatus = async () => {
        const items = pending;
        const itemCaptions = captions;
        closePreview();
        if (!items.length) return;

        const formData = new FormData();
        items.forEach((item, i) => {
            formData.append("files", { uri: item.uri, name: item.name, type: item.mimeType } as any);
            formData.append("captions", itemCaptions[i]?.trim() ?? "");
        });

        setPosting(true);
        try {
            await CHATAPI.post("/chats/addStatus", formData, { "Content-Type": "multipart/form-data" });
            await fetchStatuses();
        } catch (error) {
            Alert.alert("Couldn't post status", apiErrorMessage(error));
        } finally {
            setPosting(false);
        }
    };

    const nameOf = (phone: string) => viewName.get(phone)?.name || `+${phone}`;
    const avatarOf = (phone: string) => viewName.get(phone)?.profile_image || null;

    const handleViewerClose = useCallback(() => {
        setViewerUser(null);
        fetchStatuses();
    }, [fetchStatuses]);

    // Ring: indigo = unseen updates, gray = all viewed. Video updates show the profile photo with a play badge.
    const renderThumb = ({ status, seen, ring = true }: { status: any; seen?: boolean; ring?: boolean }) => {
        const latest = latestOf(status);
        const isVideo = latest?.type === "video";
        const fallback = avatarOf(status.phone);
        const source = !isVideo && latest?.url ? { uri: latest.url } : fallback ? { uri: fallback } : DEFAULT_AVATAR;
        return (
            <View style={[statusStyles.ring, !ring && statusStyles.ringNone, seen && statusStyles.ringSeen]}>
                <Image source={source} style={statusStyles.avatar} contentFit="cover" />
                {isVideo && (
                    <View style={{ position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(15,23,42,0.6)", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="play" size={12} color="#fff" style={{ marginLeft: 1 }} />
                    </View>
                )}
            </View>
        );
    };

    const renderUpdate = ({ status, seen, last }: { status: any; seen: boolean; last: boolean }) => {
        const count = status.stories.length;
        return (
            <TouchableOpacity
                key={status.phone}
                style={[statusStyles.item, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.divider }]}
                onPress={() => setViewerUser(status)}
                activeOpacity={0.6}
            >
                {renderThumb({ status, seen })}
                <View style={{ flex: 1 }}>
                    <Text style={statusStyles.name} numberOfLines={1}>{nameOf(status.phone)}</Text>
                    <Text style={statusStyles.time}>
                        {statusTimeAgo(latestOf(status)?.createdAt)}{count > 1 ? `  ·  ${count} updates` : ""}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    const myCount = myStatus?.stories?.length ?? 0;
    const myLatest = latestOf(myStatus);
    const myViews = myLatest ? (myLatest.viewers ?? []).filter((v: any) => v.phone !== username).length : 0;

    return (
        <SafeAreaView style={statusStyles.screen} edges={["top", "left", "right"]}>
            <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
            <View style={{ flex: 1 }}>
                <View style={statusStyles.header}>
                    <Text style={statusStyles.headerTitle}>Status</Text>
                    <TouchableOpacity style={[statusStyles.headerBtn, { marginRight: 8 }]} onPress={takeWithCamera} hitSlop={8} accessibilityLabel="Take a photo">
                        <Ionicons name="camera-outline" size={21} color={colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity style={statusStyles.headerBtn} onPress={pickFromGallery} hitSlop={8} accessibilityLabel="Add from gallery">
                        <Ionicons name="images-outline" size={20} color={colors.text} />
                    </TouchableOpacity>
                </View>
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 24 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
                >
                    {/* My status: tap to view (or add when empty), + to add more */}
                    <View style={statusStyles.myCard}>
                        <TouchableOpacity onPress={() => (myCount ? setViewerUser(myStatus) : pickFromGallery())} activeOpacity={0.8}>
                            {myStatus ? (
                                renderThumb({ status: myStatus })
                            ) : (
                                <View style={[statusStyles.ring, statusStyles.ringNone]}>
                                    <Image source={avatarOf(username as string) ? { uri: avatarOf(username as string)! } : DEFAULT_AVATAR} style={statusStyles.avatar} />
                                </View>
                            )}
                            {!myStatus && (
                                <View style={statusStyles.addIcon}>
                                    <Ionicons name="add" size={14} color={colors.textOnPrimary} />
                                </View>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity style={{ flex: 1 }} onPress={() => (myCount ? setViewerUser(myStatus) : pickFromGallery())} disabled={posting}>
                            <Text style={statusStyles.name}>My status</Text>
                            {posting ? (
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                                    <ActivityIndicator size="small" color={colors.primary} />
                                    <Text style={[statusStyles.time, { marginTop: 0, color: colors.primary }]}>Posting…</Text>
                                </View>
                            ) : (
                                <Text style={statusStyles.time} numberOfLines={1}>
                                    {myLatest
                                        ? `${statusTimeAgo(myLatest.createdAt)}  ·  ${myViews} ${myViews === 1 ? "view" : "views"}`
                                        : "Tap to add a status update"}
                                </Text>
                            )}
                        </TouchableOpacity>

                        {!!myStatus && (
                            <TouchableOpacity
                                onPress={pickFromGallery}
                                disabled={posting}
                                hitSlop={8}
                                accessibilityLabel="Add to my status"
                                style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}
                            >
                                <Ionicons name="add" size={22} color={colors.primary} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {recentUpdates.length > 0 && (
                        <>
                            <Text style={statusStyles.section}>RECENT UPDATES</Text>
                            <View style={statusStyles.card}>
                                {recentUpdates.map((s, i) => renderUpdate({ status: s, seen: false, last: i === recentUpdates.length - 1 }))}
                            </View>
                        </>
                    )}

                    {viewedUpdates.length > 0 && (
                        <>
                            <Text style={statusStyles.section}>VIEWED UPDATES</Text>
                            <View style={statusStyles.card}>
                                {viewedUpdates.map((s, i) => renderUpdate({ status: s, seen: true, last: i === viewedUpdates.length - 1 }))}
                            </View>
                        </>
                    )}

                    {loaded && recentUpdates.length === 0 && viewedUpdates.length === 0 && (
                        <View style={statusStyles.empty}>
                            <Ionicons name="aperture-outline" size={56} color={colors.primaryMuted} />
                            <Text style={statusStyles.emptyText}>No updates from your contacts yet</Text>
                        </View>
                    )}
                    {!loaded && <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />}
                </ScrollView>
            </View>
            <BottomTabBar active="status" />

            {viewerUser && (
                <StatusViewer
                    myStatus={viewerUser.phone === username}
                    user={viewerUser}
                    title={nameOf(viewerUser.phone)}
                    avatar={avatarOf(viewerUser.phone)}
                    profileOf={(phone) => viewName.get(phone)}
                    onClose={handleViewerClose}
                />
            )}

            <MediaPreviewModal
                visible={pending.length > 0}
                items={pending}
                captions={captions}
                onChangeCaption={(i, text) => setCaptions((prev) => prev.map((c, j) => (j === i ? text : c)))}
                onRemove={(i) => {
                    const items = pending.filter((_, j) => j !== i);
                    setCaptions((prev) => prev.filter((_, j) => j !== i));
                    setPending(items);
                }}
                onClose={closePreview}
                onSend={postStatus}
            />
        </SafeAreaView>
    );
}
