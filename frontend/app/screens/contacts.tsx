import { colors } from "@/theme";
import { saveConversation } from "@/db/conversationRepo";
import { CHATAPI } from "@/utils/api";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    FlatList,
    Image,
    StatusBar,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ContactsStyles } from "../styles";
import { getGlobalUsername } from "@/utils/globalRefs";

export default function Contacts() {
    const username = getGlobalUsername();
    const [contacts, setContacts] = useState<any[]>([]);
    const [search, setSearch] = useState("");
    const [filtered, setFiltered] = useState<any[]>([]);
    const router = useRouter();

    useFocusEffect(
        useCallback(() => {
            (async () => {
                const storeContacts = JSON.parse(await AsyncStorage.getItem("contactsFriend") || "[]");
                setContacts(storeContacts);
                setFiltered(storeContacts);
            })();
        }, [])
    );

    useEffect(() => {
        if (search.trim() === "") {
            setFiltered(contacts);
        } else {
            const lower = search.toLowerCase();
            setFiltered(
                contacts.filter(
                    (c) =>
                        c.name?.toLowerCase().includes(lower) ||
                        c.phone?.toLowerCase().includes(lower)
                )
            );
        }
    }, [search, contacts]);

    const startChat = async (contact: any) => {
        try {
            const res = await CHATAPI.post("/chats/createConversations", {
                type: "single",
                memberIds: [contact.phone],
            });
            // DB: insert into local database (conversations table)
            const conv = res.data.conv;
            // const conv = res.data;
            await saveConversation(conv);

            router.dismiss(1);

            router.push({
                pathname: "/screens/room",
                params: {
                    id: conv._id,
                    members: JSON.stringify(conv.members),
                    type: conv.type,
                    blocked: conv.blocked,
                    blockedBy: conv.blockedBy,
                    avatar: conv.avatar,
                    heading:
                        conv.type === "group"
                            ? conv.name
                            : conv.members.find((m: any) => m !== username),
                },
            });
        } catch (err) {
            console.error("Error starting chat:", err);
        }
    };

    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={ContactsStyles.contactItem}
            onPress={() => startChat(item)}
            activeOpacity={0.65}
            key={item.name + item.phone}
        >
            <Image
                source={{
                    uri: item.profile_image
                        ? item.profile_image
                        : `https://ui-avatars.com/api/?name=${item.name || item.phone}&background=075E54&color=fff&bold=true`,
                }}
                style={ContactsStyles.avatar}
            />
            <View style={ContactsStyles.contactInfo}>
                <Text style={ContactsStyles.name}>{item.name || item.phone}</Text>
                <Text style={ContactsStyles.subText}>{item.phone}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
            <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

            {/* Header */}
            <View style={ContactsStyles.header}>
                <TouchableOpacity style={ContactsStyles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <View style={ContactsStyles.headerText}>
                    <Text style={ContactsStyles.headerTitle}>Select Contact</Text>
                    <Text style={ContactsStyles.headerSubtitle}>{contacts.length} contacts</Text>
                </View>
            </View>

            {/* White body */}
            <View style={ContactsStyles.body}>

                {/* Search bar */}
                <View style={ContactsStyles.searchBox}>
                    <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                        placeholder="Search name or number"
                        placeholderTextColor={colors.textMuted}
                        value={search}
                        onChangeText={setSearch}
                        style={ContactsStyles.searchInput}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Section label */}
                {filtered.length > 0 && (
                    <Text style={ContactsStyles.sectionLabel}>
                        {search ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : 'Contacts on ChatApp'}
                    </Text>
                )}

                {/* Contact list */}
                <FlatList
                    data={filtered}
                    keyExtractor={(item, i) => {
                        return `contacts-${item.phone}-${item.name}`
                    }}
                    renderItem={renderItem}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    ItemSeparatorComponent={() => <View style={ContactsStyles.separator} />}
                    ListEmptyComponent={
                        <View style={ContactsStyles.empty}>
                            <Ionicons name="people-outline" size={60} color={colors.primaryMuted} />
                            <Text style={ContactsStyles.emptyTitle}>No contacts found</Text>
                            <Text style={ContactsStyles.emptySub}>Try a different name or number</Text>
                        </View>
                    }
                    removeClippedSubviews={true}      // unmount off-screen rows from memory
                    maxToRenderPerBatch={15}          // rows rendered per batch while scrolling
                    initialNumToRender={20}           // rows rendered on first load
                    windowSize={10}                   // render 5 screens above + 5 below viewport
                    updateCellsBatchingPeriod={50}    // ms between batch renders (lower = smoother)
                    getItemLayout={(_, index) => ({   // skip layout measurement — big perf win
                        length: 74,                     // must match your row height (paddingVertical 12*2 + content ~50)
                        offset: 74 * index,
                        index,
                    })}
                />
            </View>
        </SafeAreaView>
    );
}
