import { colors } from "@/theme";
import { getGlobalUsername } from "@/utils/globalRefs";
import { openChatWith } from "@/utils/startChat";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  /** Message content: { name, phone, profile } */
  content: any;
  /** Long press on the card (message options) */
  onLongPress?: () => void;
}

/** A shared contact in a chat bubble, with Message and Call actions. */
export default function ContactCard({ content, onLongPress }: Props) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const name = content?.name || "Unknown";
  const phone = content?.phone ? String(content.phone).replace(/[^\d]/g, "") : "";
  const isMe = !!phone && phone === String(getGlobalUsername() ?? "");
  const initials = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  const message = async () => {
    if (!phone || opening) return;
    setOpening(true);
    await openChatWith(phone, router);
    setOpening(false);
  };

  const call = () => {
    if (!phone) return;
    Linking.openURL(`tel:+${phone}`).catch(() => Alert.alert("Couldn't start a call"));
  };

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        {content?.profile
          ? <Image source={{ uri: content.profile }} style={styles.avatar} />
          : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.initials}>{initials}</Text>
            </View>
          )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {!!phone && <Text style={styles.phone}>+{phone}</Text>}
        </View>
        <Ionicons name="person-circle-outline" size={20} color={colors.textMuted} />
      </View>

      {!!phone && (
        <View style={styles.actions}>
          {!isMe && (
            <TouchableOpacity style={styles.action} onPress={message} onLongPress={onLongPress} disabled={opening}>
              {opening
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Ionicons name="chatbubble-outline" size={16} color={colors.primary} />}
              <Text style={styles.actionText}>Message</Text>
            </TouchableOpacity>
          )}
          {!isMe && <View style={styles.actionDivider} />}
          <TouchableOpacity style={styles.action} onPress={call} onLongPress={onLongPress}>
            <Ionicons name="call-outline" size={16} color={colors.primary} />
            <Text style={styles.actionText}>Call</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 240, backgroundColor: "rgba(255,255,255,0.7)", borderRadius: 14, overflow: "hidden" },
  top: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt },
  avatarFallback: { backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  initials: { fontSize: 15, fontWeight: "800", color: colors.primaryDark },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  phone: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  actions: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  actionDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  actionText: { fontSize: 13, fontWeight: "700", color: colors.primary },
});
