import { colors, font, radius, shadow } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
    visible: boolean;
    /** How many messages are being deleted */
    count?: number;
    /** Only your own messages can be deleted for everyone */
    allowEveryone?: boolean;
    onClose: () => void;
    onDeleteForEveryone: () => void;
    onDeleteForMe: () => void;
}

export default function DeleteMessageModal({ visible, count = 1, allowEveryone = true, onClose, onDeleteForEveryone, onDeleteForMe }: Props) {
    const many = count > 1;
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.box}>
                    <View style={styles.icon}>
                        <Ionicons name="trash-outline" size={24} color={colors.danger} />
                    </View>
                    <Text style={styles.title}>{many ? `Delete ${count} messages?` : "Delete message?"}</Text>
                    <Text style={styles.warning}>
                        {allowEveryone
                            ? "Delete for everyone removes it from this chat for all members."
                            : `${many ? "These messages" : "This message"} will be deleted from your device only.`}
                    </Text>

                    {allowEveryone && (
                        <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={onDeleteForEveryone}>
                            <Text style={[styles.btnText, { color: colors.textOnPrimary }]}>Delete for everyone</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        style={[styles.btn, allowEveryone ? styles.btnSoft : styles.btnDanger]}
                        onPress={onDeleteForMe}
                    >
                        <Text style={[styles.btnText, { color: allowEveryone ? colors.danger : colors.textOnPrimary }]}>Delete for me</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btn} onPress={onClose}>
                        <Text style={[styles.btnText, { color: colors.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
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
        padding: 20,
        alignItems: "center",
        ...shadow(3),
    },
    icon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.dangerSoft, alignItems: "center", justifyContent: "center", marginBottom: 12 },
    title: { fontSize: font.h2, fontWeight: "700", color: colors.text, marginBottom: 6 },
    warning: { fontSize: font.small + 1, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 18 },
    btn: { alignSelf: "stretch", paddingVertical: 13, borderRadius: radius.md, alignItems: "center", marginTop: 8 },
    btnDanger: { backgroundColor: colors.danger },
    btnSoft: { backgroundColor: colors.dangerSoft },
    btnText: { fontSize: font.body, fontWeight: "700" },
});
