import { colors, font, radius, shadow } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

interface Props {
    visible: boolean;
    title: string;
    message?: string;
    icon?: IconName;
    confirmLabel: string;
    cancelLabel?: string | null;
    destructive?: boolean;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
}

export default function ConfirmDialog({
    visible, title, message, icon, confirmLabel, cancelLabel = "Cancel", destructive, onConfirm, onCancel,
}: Props) {
    const [busy, setBusy] = useState(false);
    const tint = destructive ? colors.danger : colors.primary;

    const confirm = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await onConfirm();
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && onCancel()} statusBarTranslucent>
            <Pressable style={styles.overlay} onPress={() => !busy && onCancel()}>
                {/* Inner Pressable keeps taps on the card from closing it */}
                <Pressable style={styles.box}>
                    {!!icon && (
                        <View style={[styles.icon, { backgroundColor: destructive ? colors.dangerSoft : colors.primarySoft }]}>
                            <Ionicons name={icon} size={24} color={tint} />
                        </View>
                    )}
                    <Text style={styles.title}>{title}</Text>
                    {!!message && <Text style={styles.message}>{message}</Text>}

                    <View style={styles.actions}>
                        {cancelLabel !== null && (
                            <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={onCancel} disabled={busy}>
                                <Text style={[styles.btnText, { color: colors.text }]}>{cancelLabel}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={[styles.btn, { backgroundColor: tint }]} onPress={confirm} disabled={busy}>
                            {busy
                                ? <ActivityIndicator size="small" color={colors.textOnPrimary} />
                                : <Text style={[styles.btnText, { color: colors.textOnPrimary }]}>{confirmLabel}</Text>}
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", alignItems: "center", padding: 24 },
    box: {
        width: "100%",
        maxWidth: 340,
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        padding: 22,
        alignItems: "center",
        ...shadow(3),
    },
    icon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 12 },
    title: { fontSize: font.h2, fontWeight: "700", color: colors.text, textAlign: "center" },
    message: { fontSize: font.small + 1, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginTop: 6 },
    actions: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 20 },
    btn: { flex: 1, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
    btnCancel: { backgroundColor: colors.surfaceAlt },
    btnText: { fontSize: font.body, fontWeight: "700" },
});
