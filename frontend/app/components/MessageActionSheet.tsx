import { colors, font, radius, shadow } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export interface MessageAction {
    key: string;
    label: string;
    icon: IconName;
    danger?: boolean;
    onPress: () => void;
}

interface Props {
    visible: boolean;
    /** Short preview of the message the actions apply to */
    preview: { icon?: IconName; text: string; time?: string; mine?: boolean } | null;
    actions: MessageAction[];
    onClose: () => void;
}

/** Bottom sheet shown when a message is long-pressed: Reply, Copy, Edit, Info, Forward, Delete… */
export default function MessageActionSheet({ visible, preview, actions, onClose }: Props) {
    const insets = useSafeAreaInsets();
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!visible) return;
        anim.setValue(0);
        Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 220, mass: 0.8 }).start();
    }, [visible, anim]);

    // Quick actions as tiles on top, the rest (and destructive ones) as rows
    const quick = actions.filter((a) => !a.danger).slice(0, 4);
    const rest = actions.filter((a) => !quick.includes(a));

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close message options" />
            <Animated.View
                style={[
                    s.sheet,
                    { paddingBottom: insets.bottom + 12 },
                    { transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [360, 0] }) }] },
                ]}
            >
                <View style={s.handle} />

                {!!preview && (
                    <View style={[s.preview, preview.mine && s.previewMine]}>
                        {!!preview.icon && <Ionicons name={preview.icon} size={16} color={colors.textSecondary} />}
                        <Text style={s.previewText} numberOfLines={2}>{preview.text}</Text>
                        {!!preview.time && <Text style={s.previewTime}>{preview.time}</Text>}
                    </View>
                )}

                {quick.length > 0 && (
                    <View style={s.quickRow}>
                        {quick.map((a) => (
                            <TouchableOpacity key={a.key} style={s.quickBtn} onPress={a.onPress} activeOpacity={0.7}>
                                <View style={s.quickIcon}>
                                    <Ionicons name={a.icon} size={22} color={colors.primary} />
                                </View>
                                <Text style={s.quickLabel} numberOfLines={1}>{a.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {rest.length > 0 && (
                    <View style={s.card}>
                        {rest.map((a, i) => (
                            <TouchableOpacity
                                key={a.key}
                                style={[s.row, i === rest.length - 1 && { borderBottomWidth: 0 }]}
                                onPress={a.onPress}
                                activeOpacity={0.7}
                            >
                                <View style={[s.rowIcon, a.danger && { backgroundColor: colors.dangerSoft }]}>
                                    <Ionicons name={a.icon} size={19} color={a.danger ? colors.danger : colors.primary} />
                                </View>
                                <Text style={[s.rowLabel, a.danger && { color: colors.danger }]}>{a.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </Animated.View>
        </Modal>
    );
}

const s = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay },
    sheet: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.background,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        paddingHorizontal: 16,
        paddingTop: 10,
    },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.primaryMuted, alignSelf: "center", marginBottom: 14 },

    preview: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        alignSelf: "flex-start",
        maxWidth: "90%",
        backgroundColor: colors.bubbleTheirs,
        borderRadius: radius.md,
        paddingHorizontal: 12,
        paddingVertical: 9,
        marginBottom: 14,
        ...shadow(1),
    },
    previewMine: { alignSelf: "flex-end", backgroundColor: colors.bubbleMine },
    previewText: { flexShrink: 1, fontSize: font.body - 1, color: colors.text },
    previewTime: { fontSize: font.tiny, color: colors.textSecondary, alignSelf: "flex-end" },

    quickRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    quickBtn: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 12,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        ...shadow(1),
    },
    quickIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    quickLabel: { fontSize: font.small - 1, fontWeight: "600", color: colors.text, marginTop: 6 },

    card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", ...shadow(1) },
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
    rowLabel: { flex: 1, fontSize: font.body, color: colors.text, fontWeight: "500" },
});
