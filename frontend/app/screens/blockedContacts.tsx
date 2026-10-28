import { ReelStyles, SettingsStyle } from "@/app/styles";
import { colors, statusBarStyle } from "@/theme";
import { apiErrorMessage, CHATAPI } from "@/utils/api";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Blocked = { phone: string; name: string; photo: string | null };

// Blocked numbers, with names from the synced contacts when we have them
async function loadBlocked(): Promise<Blocked[]> {
  const res = await CHATAPI.get("/chats/getblockedUser");
  const phones: string[] = (res.data.blockedNo ?? []).map(String);

  const contacts: any[] = JSON.parse((await AsyncStorage.getItem("contactsFriend")) || "[]");
  return phones.map((phone) => {
    const c = contacts.find((x) => String(x.phone) === phone);
    return { phone, name: c?.name || c?.full_name || `+${phone}`, photo: c?.profile_image ?? null };
  });
}

export default function BlockedContactsScreen() {
  const router = useRouter();
  const [list, setList] = useState<Blocked[] | null>(null);
  const [busyPhone, setBusyPhone] = useState<string | null>(null);

  useEffect(() => {
    loadBlocked()
      .then(setList)
      .catch((err) => {
        setList([]);
        Alert.alert("Couldn't load", apiErrorMessage(err));
      });
  }, []);

  const unblock = async (person: Blocked) => {
    setBusyPhone(person.phone);
    try {
      // Unblocking works on the chat with that person
      const conv = await CHATAPI.post("/chats/createConversations", { type: "single", memberIds: [person.phone] });
      await CHATAPI.post("/chats/unblockUser", { no: person.phone, conversationId: conv.data.conv._id });
      setList((prev) => (prev ?? []).filter((p) => p.phone !== person.phone));
    } catch (err) {
      Alert.alert("Couldn't unblock", apiErrorMessage(err));
    } finally {
      setBusyPhone(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={colors.surface} />
      <View style={SettingsStyle.header}>
        <TouchableOpacity style={SettingsStyle.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={SettingsStyle.headerTitle}>Blocked Contacts</Text>
      </View>

      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {list === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={list}
            keyExtractor={(p) => p.phone}
            ItemSeparatorComponent={() => <View style={SettingsStyle.divider} />}
            renderItem={({ item }) => (
              <View style={ReelStyles.personRow}>
                <View style={ReelStyles.personAvatar}>
                  {item.photo
                    ? <Image source={{ uri: item.photo }} style={{ width: 44, height: 44 }} />
                    : <Ionicons name="person" size={22} color={colors.primary} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ReelStyles.personName} numberOfLines={1}>{item.name}</Text>
                  <Text style={ReelStyles.personSub}>+{item.phone}</Text>
                </View>
                <TouchableOpacity style={ReelStyles.listFollowBtn} onPress={() => unblock(item)} disabled={busyPhone === item.phone}>
                  {busyPhone === item.phone
                    ? <ActivityIndicator size="small" color={colors.textOnPrimary} />
                    : <Text style={ReelStyles.listFollowText}>Unblock</Text>}
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={<Text style={ReelStyles.hintText}>You haven&apos;t blocked anyone.</Text>}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
