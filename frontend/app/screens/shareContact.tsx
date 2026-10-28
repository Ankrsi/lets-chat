import { getConversationById, updateConversationLastMessage } from "@/db/conversationRepo";
import { saveMessage } from "@/db/messageRepo";
import { colors, radius, shadow, statusBarStyle } from "@/theme";
import { encryptOutgoingMessage } from "@/utils/e2ee";
import { getGlobalSocket, getGlobalUsername, setGlobalDbTick } from "@/utils/globalRefs";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Contact {
  name: string;
  phone: string;
  profile_image?: string | null;
}

const initialsOf = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export default function ShareContactScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const username = getGlobalUsername();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<string[]>([]); // phones, in selection order
  const [query, setQuery] = useState("");
  const [roomInfo, setRoomInfo] = useState<any>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      setRoomInfo(await getConversationById(id as string));
      // Contacts already on the app (from the last contact sync), one entry per phone
      const friends: any[] = JSON.parse((await AsyncStorage.getItem("contactsFriend")) || "[]");
      const byPhone = new Map<string, Contact>();
      for (const f of friends) {
        const phone = String(f?.phone ?? "").replace(/[^\d]/g, "");
        if (!phone || byPhone.has(phone)) continue;
        byPhone.set(phone, { name: f.name || f.full_name || `+${phone}`, phone, profile_image: f.profile_image ?? null });
      }
      setContacts([...byPhone.values()].sort((a, b) => a.name.localeCompare(b.name)));
    })();
  }, [id]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    const digits = q.replace(/[^\d]/g, "");
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || (!!digits && c.phone.includes(digits)));
  }, [contacts, query]);

  const toggle = (phone: string) =>
    setSelected((prev) => (prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone]));

  const send = async () => {
    if (!selected.length || sending) return;
    setSending(true);
    const socket = getGlobalSocket();
    try {
      // One message per contact, in the order they were picked
      for (const phone of selected) {
        const c = contacts.find((x) => x.phone === phone);
        if (!c) continue;
        const now = new Date().toISOString();
        const socketData = {
          messageId: Crypto.randomUUID(),
          conversationId: id,
          senderId: username,
          content: { name: c.name, phone: c.phone, profile: c.profile_image ?? null },
          messageType: "contact",
          conv_type: roomInfo?.type, // needed by encryption, same as other messages
          status: "sent",
          timestamp: now,
          createdAt: now,
          updatedAt: now,
        };
        await saveMessage(socketData);
        await updateConversationLastMessage({
          id,
          lastMessageId: socketData.messageId,
          lastMessage: `👤 ${c.name}`,
          lastMessageType: "contact",
          lastMessageSenderId: username,
          lastMessageStatus: "sent",
          lastMessageDate: now,
        }, username!);
        setGlobalDbTick();
        await encryptOutgoingMessage(socketData);
        socket?.emit("chat:send-message", socketData);
      }
      router.back();
    } catch (err: any) {
      console.error("send contact failed", err);
      Alert.alert("Couldn't send contact", err?.message || "Try again.");
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: Contact }) => {
    const isSelected = selected.includes(item.phone);
    return (
      <TouchableOpacity style={[styles.row, isSelected && styles.rowSelected]} onPress={() => toggle(item.phone)} activeOpacity={0.6}>
        <View>
          {item.profile_image
            ? <Image source={{ uri: item.profile_image }} style={styles.avatar} />
            : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.initials}>{initialsOf(item.name)}</Text>
              </View>
            )}
          {isSelected && (
            <View style={styles.checkBadge}>
              <Ionicons name="checkmark" size={12} color="#FFFFFF" />
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.phone}>+{item.phone}</Text>
        </View>
        <View style={[styles.ring, isSelected && styles.ringActive]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right", "bottom"]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={colors.surface} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Send contact</Text>
          <Text style={styles.subtitle}>
            {selected.length ? `${selected.length} selected` : `${contacts.length} contact${contacts.length === 1 ? "" : "s"} on the app`}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name or number"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
        />
        {!!query && (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(c) => c.phone}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={{ paddingBottom: 16 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={32} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>{query ? "No matches" : "No contacts yet"}</Text>
            <Text style={styles.emptySub}>
              {query ? "Try a different name or number." : "Contacts who use the app will show up here."}
            </Text>
          </View>
        }
      />

      {/* Send bar: only once something is picked */}
      {selected.length > 0 && (
        <View style={styles.bottomBar}>
          <Text style={styles.selectedNames} numberOfLines={1}>
            {selected.map((p) => contacts.find((c) => c.phone === p)?.name).filter(Boolean).join(", ")}
          </Text>
          <TouchableOpacity style={[styles.sendBtn, sending && { opacity: 0.6 }]} onPress={send} disabled={sending}>
            {sending
              ? <ActivityIndicator color="#FFFFFF" />
              : (
                <>
                  <Ionicons name="send" size={18} color="#FFFFFF" />
                  <Text style={styles.sendText}>Send {selected.length > 1 ? `${selected.length} contacts` : "contact"}</Text>
                </>
              )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },

  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  rowSelected: { backgroundColor: colors.primarySoft },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceAlt },
  avatarFallback: { backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  initials: { fontSize: 16, fontWeight: "800", color: colors.primaryDark },
  checkBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  name: { fontSize: 16, fontWeight: "700", color: colors.text },
  phone: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  ring: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  ringActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  separator: { height: 1, backgroundColor: colors.divider, marginLeft: 78 },

  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  emptySub: { fontSize: 14, color: colors.textSecondary, textAlign: "center", marginTop: 6 },

  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 8,
  },
  selectedNames: { fontSize: 13, color: colors.textSecondary },
  sendBtn: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...shadow(2),
    shadowColor: colors.primary,
  },
  sendText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
