import { ContactContext } from "@/contexts/FriendContactContext";
import { useDbUpdate } from "@/contexts/DbUpdateContext";
import { getMessageById, getMessageReceiptsById } from "@/db/messageRepo";
import { colors, font, radius, shadow } from "@/theme";
import { getGlobalUsername } from "@/utils/globalRefs";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useContext, useEffect, useState } from "react";
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

interface Receipt {
    memberId: string;
    status: "delivered" | "read" | string;
    timestamp: string;
    deliveredAt?: string | null;
    readAt?: string | null;
}

// Older receipts only have the latest status + its time
const deliveredTime = (r?: Receipt) => r?.deliveredAt || (r?.status === "delivered" ? r.timestamp : null);
const readTime = (r?: Receipt) => r?.readAt || (r?.status === "read" ? r.timestamp : null);

const DEFAULT_AVATAR = require("../../assets/images/user.png");

const MEDIA: Record<string, { icon: IconName; label: string }> = {
    image: { icon: "image-outline", label: "Photo" },
    video: { icon: "videocam-outline", label: "Video" },
    document: { icon: "document-text-outline", label: "Document" },
    audio: { icon: "musical-notes-outline", label: "Audio" },
    voice: { icon: "mic-outline", label: "Voice message" },
    location: { icon: "location-outline", label: "Location" },
    contact: { icon: "person-circle-outline", label: "Contact" },
};

const parseJson = (raw: any): any => {
    if (!raw) return {};
    if (typeof raw !== "string") return raw;
    try { return JSON.parse(raw) ?? {}; } catch { return {}; }
};

const formatWhen = (timestamp?: string | null) => {
    if (!timestamp) return "";
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return "";
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
    const sameYear = d.getFullYear() === today.getFullYear();
    const date = d.toLocaleDateString([], { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
    return `${date}, ${time}`;
};

export default function MessageInfoScreen() {
    const { messageId, convId, type } = useLocalSearchParams();
    const { viewName } = useContext(ContactContext);
    const { dbTick } = useDbUpdate();
    const insets = useSafeAreaInsets();
    const username = getGlobalUsername();

    const [msg, setMsg] = useState<any>(null);
    const [receipts, setReceipts] = useState<Receipt[]>([]);

    // Reloads when receipts arrive while the screen is open
    useEffect(() => {
        (async () => {
            const [msgData, receiptData]: any[] = await Promise.all([
                getMessageById(messageId as string, convId as string),
                getMessageReceiptsById(messageId as string, convId as string),
            ]);
            setMsg(msgData ?? null);
            setReceipts(((receiptData as Receipt[]) ?? []).filter((r) => r.memberId !== username));
        })();
    }, [messageId, convId, dbTick, username]);

    const profileOf = (memberId: string) => viewName?.get(memberId);
    const nameOf = (memberId: string) => profileOf(memberId)?.name || memberId;
    const avatarOf = (memberId: string) => {
        const uri = profileOf(memberId)?.profile_image;
        return uri ? { uri } : DEFAULT_AVATAR;
    };

    // One receipt row per member holding their latest status, so "read" also means delivered
    // Everyone who has read it was also delivered to, so "Delivered to" lists them too, with their delivery time
    const readBy = receipts.filter((r) => r.status === "read");
    const deliveredTo = receipts.filter((r) => r.status === "delivered" || r.status === "read");

    const isGroup = type === "group";
    const content = parseJson(msg?.content);
    const media = msg ? MEDIA[msg.messageType] : undefined;
    const firstImage = msg?.messageType === "image" ? (content?.urls?.[0]?.url || content?.urls?.[0]) : null;
    const caption = Array.isArray(content?.caption) ? content.caption.filter(Boolean).join("\n") : content?.caption;
    const bodyText = (typeof content?.msg === "string" && content.msg) || caption || content?.name || "";

    // 1-to-1: the other person's receipt (falls back to the message status for older messages)
    const peerReceipt = receipts[0];
    const peerStatus = peerReceipt?.status || (msg?.status !== "sent" ? msg?.status : undefined);
    const readAt = peerStatus === "read" ? formatWhen(readTime(peerReceipt)) || "Read" : "";
    const deliveredAt = peerStatus === "delivered" || peerStatus === "read" ? formatWhen(deliveredTime(peerReceipt)) || "Delivered" : "";

    return (
        <SafeAreaView style={s.container} edges={["top", "left", "right"]}>
            <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.headerBtn} accessibilityLabel="Back">
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Message info</Text>
                <View style={s.headerBtn} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
                {/* The message */}
                <View style={s.previewArea}>
                    {msg ? (
                        <View style={s.bubble}>
                            {!!firstImage && (
                                <Image source={{ uri: firstImage }} style={s.thumb} contentFit="cover" />
                            )}
                            {!!media && !firstImage && (
                                <View style={s.mediaRow}>
                                    <View style={s.mediaIcon}>
                                        <Ionicons name={media.icon} size={18} color={colors.primary} />
                                    </View>
                                    <Text style={s.mediaLabel} numberOfLines={1}>{content?.name || media.label}</Text>
                                </View>
                            )}
                            {!!bodyText && (!media || caption) && <Text style={s.bubbleText}>{caption || bodyText}</Text>}
                            {!bodyText && !media && !firstImage && <Text style={s.bubbleMuted}>No message content</Text>}
                            <View style={s.timeRow}>
                                {msg.edited == 1 && <Text style={s.bubbleTime}>Edited ·</Text>}
                                <Text style={s.bubbleTime}>{formatWhen(msg.timestamp || msg.createdAt)}</Text>
                                <Ionicons
                                    name={msg.status === "sent" ? "checkmark" : "checkmark-done"}
                                    size={16}
                                    color={msg.status === "read" ? colors.readTick : colors.textMuted}
                                />
                            </View>
                        </View>
                    ) : (
                        <Text style={s.bubbleMuted}>This message is no longer available.</Text>
                    )}
                </View>

                {!isGroup ? (
                    <View style={s.card}>
                        <StatusRow icon="checkmark-done" iconColor={colors.readTick} title="Read" value={readAt} />
                        <StatusRow icon="checkmark-done" iconColor={colors.textMuted} title="Delivered" value={deliveredAt} last />
                    </View>
                ) : (
                    <>
                        <MemberSection
                            title="Read by"
                            icon="checkmark-done"
                            iconColor={colors.readTick}
                            items={readBy.map((r) => ({ id: r.memberId, sub: formatWhen(readTime(r)) }))}
                            empty="No one has read this yet"
                            nameOf={nameOf}
                            avatarOf={avatarOf}
                        />
                        <MemberSection
                            title="Delivered to"
                            icon="checkmark-done"
                            iconColor={colors.textMuted}
                            items={deliveredTo.map((r) => ({ id: r.memberId, sub: formatWhen(deliveredTime(r)) || "Delivered" }))}
                            empty="Not delivered yet"
                            nameOf={nameOf}
                            avatarOf={avatarOf}
                        />
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const StatusRow = ({ icon, iconColor, title, value, last }: { icon: IconName; iconColor: string; title: string; value: string; last?: boolean }) => (
    <View style={[s.row, last && { borderBottomWidth: 0 }]}>
        <View style={s.rowIcon}>
            <Ionicons name={icon} size={19} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{title}</Text>
            <Text style={[s.rowSub, !value && { color: colors.textMuted }]}>{value || "Not yet"}</Text>
        </View>
    </View>
);

const MemberSection = ({ title, icon, iconColor, items, empty, nameOf, avatarOf }: {
    title: string;
    icon: IconName;
    iconColor: string;
    items: { id: string; sub: string }[];
    empty: string;
    nameOf: (id: string) => string;
    avatarOf: (id: string) => any;
}) => (
    <View style={{ marginTop: 18 }}>
        <View style={s.sectionHead}>
            <Ionicons name={icon} size={16} color={iconColor} />
            <Text style={s.sectionTitle}>{title}</Text>
            {items.length > 0 && <Text style={s.sectionCount}>{items.length}</Text>}
        </View>
        <View style={s.card}>
            {items.map((it, i) => (
                <View key={it.id} style={[s.row, i === items.length - 1 && { borderBottomWidth: 0 }]}>
                    <Image source={avatarOf(it.id)} style={s.avatar} />
                    <View style={{ flex: 1 }}>
                        <Text style={s.rowTitle} numberOfLines={1}>{nameOf(it.id)}</Text>
                        <Text style={s.rowSub}>{it.sub}</Text>
                    </View>
                </View>
            ))}
            {items.length === 0 && <Text style={s.empty}>{empty}</Text>}
        </View>
    </View>
);

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 8,
        height: 56,
        backgroundColor: colors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    headerTitle: { fontSize: font.h2, fontWeight: "700", color: colors.text },

    previewArea: { paddingHorizontal: 16, paddingVertical: 20, backgroundColor: colors.surfaceAlt },
    bubble: {
        alignSelf: "flex-end",
        maxWidth: "85%",
        minWidth: 120,
        backgroundColor: colors.bubbleMine,
        borderRadius: 18,
        borderBottomRightRadius: 6,
        padding: 8,
        paddingHorizontal: 12,
        ...shadow(1),
    },
    thumb: { width: 220, height: 220, borderRadius: radius.md, marginBottom: 6, backgroundColor: colors.surfaceAlt },
    mediaRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
    mediaIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
    mediaLabel: { flexShrink: 1, fontSize: font.body, fontWeight: "600", color: colors.text },
    bubbleText: { fontSize: font.body, color: colors.text, lineHeight: 20 },
    bubbleMuted: { fontSize: font.body, color: colors.textMuted, fontStyle: "italic", textAlign: "center" },
    timeRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 4 },
    bubbleTime: { fontSize: font.tiny, color: colors.textSecondary },

    card: { marginHorizontal: 16, marginTop: 16, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", ...shadow(1) },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.divider,
    },
    rowIcon: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    rowTitle: { fontSize: font.body, fontWeight: "600", color: colors.text },
    rowSub: { fontSize: font.small, color: colors.textSecondary, marginTop: 2 },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt },

    sectionHead: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 20, marginBottom: -8 },
    sectionTitle: { fontSize: font.small - 1, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.6 },
    sectionCount: {
        fontSize: font.tiny,
        fontWeight: "700",
        color: colors.primaryDark,
        backgroundColor: colors.primarySoft,
        paddingHorizontal: 7,
        paddingVertical: 1,
        borderRadius: radius.pill,
        overflow: "hidden",
    },
    empty: { fontSize: font.small + 1, color: colors.textMuted, padding: 16, textAlign: "center" },
});
