import { colors, statusBarStyle } from "@/theme";
import { ReelStyles, SettingsStyle } from "@/app/styles";
import { AuthAPI } from "@/utils/api";
import { getGlobalUsername } from "@/utils/globalRefs";
import { normalizeUsername, usernameFormatError } from "@/utils/username";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Person {
  phone: string;
  name: string;
  sub: string;
  profile_image: string | null;
}

function PersonRow({ person, onPress }: { person: Person; onPress: () => void }) {
  return (
    <TouchableOpacity style={ReelStyles.personRow} onPress={onPress} activeOpacity={0.6}>
      <View style={ReelStyles.personAvatar}>
        {person.profile_image
          ? <Image source={{ uri: person.profile_image }} style={{ width: 44, height: 44 }} />
          : <Ionicons name="person" size={22} color={colors.primary} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ReelStyles.personName} numberOfLines={1}>{person.name}</Text>
        <Text style={ReelStyles.personSub} numberOfLines={1}>{person.sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function FindPeopleScreen() {
  const router = useRouter();
  const me = String(getGlobalUsername() ?? "");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Person | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [contacts, setContacts] = useState<Person[]>([]);

  // Contacts already on the app, from the last contact sync
  useEffect(() => {
    AsyncStorage.getItem("contactsFriend").then((raw) => {
      const list: any[] = raw ? JSON.parse(raw) : [];
      setContacts(list
        .filter((c) => c?.isOnboarded && c.phone && String(c.phone) !== me)
        .map((c) => ({
          phone: String(c.phone),
          name: c.name || c.full_name || `+${c.phone}`,
          sub: c.full_name && c.full_name !== c.name ? c.full_name : `+${c.phone}`,
          profile_image: c.profile_image ?? null,
        })));
    }).catch(() => setContacts([]));
  }, [me]);

  // Exact-match username lookup, debounced
  useEffect(() => {
    const username = normalizeUsername(query);
    setResult(null);
    setNotFound(false);
    if (!username || usernameFormatError(username)) return;

    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await AuthAPI.get(`/profile/user/${encodeURIComponent(username)}`);
        const u = res.data.user;
        if (!cancelled) setResult({
          phone: String(u.phone),
          name: u.full_name || `@${u.username}`,
          sub: `@${u.username}`,
          profile_image: u.profile_image ?? null,
        });
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setSearching(false);
    };
  }, [query]);

  const open = (phone: string) => router.push({ pathname: "/screens/reels/userProfile", params: { phone } });
  const typed = normalizeUsername(query);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={colors.surface} />
      <View style={SettingsStyle.header}>
        <TouchableOpacity style={SettingsStyle.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={SettingsStyle.headerTitle}>Find people</Text>
      </View>

      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={ReelStyles.searchWrap}>
          <Ionicons name="at" size={18} color={colors.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            style={ReelStyles.searchInput}
            value={query}
            onChangeText={(v) => setQuery(v.replace(/\s/g, ""))}
            placeholder="Search by username"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {searching && <ActivityIndicator color={colors.primary} />}
        </View>

        <FlatList
          data={typed ? [] : contacts}
          keyExtractor={(p) => p.phone}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={SettingsStyle.divider} />}
          ListHeaderComponent={
            typed ? (
              <>
                {result && (result.phone === me
                  ? <Text style={ReelStyles.hintText}>{"That's you!"}</Text>
                  : <PersonRow person={result} onPress={() => open(result.phone)} />)}
                {notFound && <Text style={ReelStyles.hintText}>No one with the username @{typed}</Text>}
                {!!usernameFormatError(typed) && typed.length >= 3 && (
                  <Text style={ReelStyles.hintText}>Usernames use letters, numbers, &apos;.&apos; and &apos;_&apos;</Text>
                )}
              </>
            ) : contacts.length > 0 ? <Text style={ReelStyles.sectionLabel}>CONTACTS ON THE APP</Text> : null
          }
          renderItem={({ item }) => <PersonRow person={item} onPress={() => open(item.phone)} />}
          ListEmptyComponent={typed ? null : (
            <Text style={ReelStyles.hintText}>Search for someone by their exact username to see their profile and follow them.</Text>
          )}
        />
      </View>
    </SafeAreaView>
  );
}
