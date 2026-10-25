import { colors } from "@/theme";
import { encryptOutgoingMessage } from "@/utils/e2ee";
import { SelectContactsStyles } from "@/app/styles";
import { saveConversation, updateConversationLastMessage, updateGroupMembers } from "@/db/conversationRepo";
import { saveMessage } from "@/db/messageRepo";
import { CHATAPI } from "@/utils/api";
import { getGlobalSocket, getGlobalUsername, setGlobalDbTick } from "@/utils/globalRefs";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from 'expo-crypto';
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    Alert,
    FlatList,
    Image,
    ScrollView,
    StatusBar,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SelectContacts() {
    const { addMemberInGroup = false, forward = false, messages, conversationId } = useLocalSearchParams();
    const [contacts, setContacts] = useState<any[]>([]);
    const [search, setSearch] = useState("");
    const [filtered, setFiltered] = useState<any[]>([]);
    const [selectedContact, setSelectedContact] = useState<any[]>([]);
    const router = useRouter();
    const socket = getGlobalSocket();
    const username = getGlobalUsername();

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

    const handleNext = () => {
        if (addMemberInGroup) {
            addMemberFun?.();
        } else if (forward) {
            forwardMsg?.();
        } else {
            router.navigate({
                pathname: '/screens/createGroup/createGroup',
                params: { selectedContact: JSON.stringify(selectedContact) },
            });
        }
    };

    const addMemberFun = async () => {
        const members = selectedContact.map((mem) => mem.phone)
        const res = await CHATAPI.post("/chats/addMembersInConversation", {
            conversationId,
            members,
        });
        if (res.success == true && res.statusCode == 200) {
            await updateGroupMembers(res.data.conversationId, res.data.members, res.data.removedMembers);
            setSelectedContact([]);
            router.back();
        }
        else {
            Alert.alert(
                "Failed",
                "Member added to failed!",
                [{ text: "OK" }]
            );
        }
    }

    const sendToSocket = async (id: string, otherUser: string, messageType: string, actualData: any, roomInfo: any, replyMsg: any = null) => {
        const socketData = {
            messageId: Crypto.randomUUID(),
            conversationId: id,
            senderId: username,
            content: actualData,
            messageType: messageType,
            status: "sent",
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }
        if (replyMsg) {
            (socketData as any)['replyToMessage'] = replyMsg || null;
        }

        await saveMessage(socketData);

        await updateConversationLastMessage({
            id: id,
            lastMessageId: socketData.messageId,
            lastMessage: socketData.content.msg || socketData.messageType,
            lastMessageType: socketData.messageType,
            lastMessageSenderId: username,
            lastMessageStatus: "sent",
            lastMessageDate: new Date().toISOString(),
        }, username!);
        setGlobalDbTick();
        await encryptOutgoingMessage(socketData);
        socket?.emit("chat:send-message", socketData);
        return null;
    };

    const forwardMsg = async () => {
        const members = selectedContact.map((mem) => mem.phone)
        const messagesData = JSON.parse(messages as string || "")
        for (let member of members) {
            const res = await CHATAPI.post("/chats/createConversations", {
                type: "single",
                memberIds: [member],
            });
            await saveConversation(res.data);
            for (let msg of messagesData) {

                const actualData = {
                    ...msg,
                    messageId: Crypto.randomUUID(),
                    conversationId: res.data._id,
                    senderId: username,
                    forwarded: true,
                    timestamp: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
                let otherUser = JSON.parse(res.data?.members || '[]');
                otherUser = otherUser[0] == username ? otherUser[1] : otherUser[0];
                await sendToSocket(res.data._id, otherUser, actualData.messageType, actualData, res.data);
            }
            router.dismiss(2);
        }
    }

    const selectedItem = (item: any) => {
        let selected = [...selectedContact]
        const exists = selected.some(el => el["phone"] === item["phone"]);
        if (exists) {
            setSelectedContact(selected.filter(el => el["phone"] !== item["phone"]));
        } else {
            setSelectedContact([...selected, item]);
        }
    }

    const renderItem = ({ item }: { item: any }) => {
        const isSelected = selectedContact.some(c => c.phone === item.phone);

        return (
            <TouchableOpacity
                style={[SelectContactsStyles.contactItem, isSelected && SelectContactsStyles.contactItemSelected]}
                onPress={() => selectedItem(item)}
                activeOpacity={0.7}
            >
                <View style={SelectContactsStyles.avatarWrapper}>
                    <Image
                        source={{
                            uri: item.profile_image ||
                                `https://ui-avatars.com/api/?name=${item.name || item.phone}&background=075E54&color=fff`,
                        }}
                        style={SelectContactsStyles.avatar}
                    />
                    {isSelected && (
                        <View style={SelectContactsStyles.checkBadge}>
                            <Ionicons name="checkmark" size={10} color="#fff" />
                        </View>
                    )}
                </View>

                <View style={{ flex: 1 }}>
                    <Text style={SelectContactsStyles.name}>{item.name || item.phone}</Text>
                    <Text style={SelectContactsStyles.subText} numberOfLines={1}>{item.phone}</Text>
                </View>

                <View style={[SelectContactsStyles.selRing, isSelected && SelectContactsStyles.selRingActive]}>
                    {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
                </View>
            </TouchableOpacity>
        );
    };

    const btnLabel = forward ? 'Forward' : addMemberInGroup ? 'Add Member' : 'Next';

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
            <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

            {/* ── Header ── */}
            <View style={SelectContactsStyles.header}>
                <TouchableOpacity
                    style={SelectContactsStyles.backBtn}
                    onPress={() => router.back()}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <View>
                    <Text style={SelectContactsStyles.headerTitle}>Select Contact</Text>
                    <Text style={SelectContactsStyles.headerSubtitle}>
                        {contacts.length} contacts
                    </Text>
                </View>
            </View>

            {/* ── White body ── */}
            <View style={SelectContactsStyles.body}>

                {/* Search bar */}
                <View style={SelectContactsStyles.searchBox}>
                    <Ionicons
                        name="search"
                        size={18}
                        color={colors.textMuted}
                        style={{ marginRight: 8 }}
                    />
                    <TextInput
                        placeholder="Search name or number"
                        placeholderTextColor={colors.textMuted}
                        value={search}
                        onChangeText={setSearch}
                        style={SelectContactsStyles.searchInput}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Section label */}
                {filtered.length > 0 && (
                    <Text style={SelectContactsStyles.sectionLabel}>
                        {search
                            ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`
                            : 'Contacts on ChatApp'}
                    </Text>
                )}

                {/* Contact list */}
                <FlatList
                    data={filtered}
                    keyExtractor={(item, i) => i.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={{ paddingBottom: 20 }}
                    ItemSeparatorComponent={() => <View style={SelectContactsStyles.separator} />}
                    ListEmptyComponent={
                        <View style={SelectContactsStyles.empty}>
                            <Ionicons name="people-outline" size={60} color={colors.primaryMuted} />
                            <Text style={SelectContactsStyles.emptyTitle}>No contacts found</Text>
                            <Text style={SelectContactsStyles.emptySub}>
                                Try a different name or number
                            </Text>
                        </View>
                    }
                    removeClippedSubviews
                    maxToRenderPerBatch={15}
                    initialNumToRender={20}
                    windowSize={10}
                    updateCellsBatchingPeriod={50}
                    getItemLayout={(_, index) => ({
                        length: 68,
                        offset: 68 * index,
                        index,
                    })}
                />

                {/* ── Selected strip ── */}
                {selectedContact.length > 0 && (
                    <View style={SelectContactsStyles.stripContainer}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ gap: 14, paddingHorizontal: 16 }}
                        >
                            {selectedContact.map(c => (
                                <TouchableOpacity
                                    key={c.phone}
                                    onPress={() => selectedItem(c)}
                                    style={{ alignItems: 'center', gap: 4 }}
                                >
                                    <View style={SelectContactsStyles.stripAvatarWrap}>
                                        <Image
                                            source={{
                                                uri:
                                                    c.profile_image ||
                                                    `https://ui-avatars.com/api/?name=${c.name || c.phone}&background=075E54&color=fff`,
                                            }}
                                            style={SelectContactsStyles.stripAvatar}
                                        />
                                        <View style={SelectContactsStyles.stripRemove}>
                                            <Ionicons name="close" size={11} color={colors.text} />
                                        </View>
                                    </View>
                                    <Text style={SelectContactsStyles.stripName} numberOfLines={1}>
                                        {(c.name || c.phone).split(' ')[0]}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Next / Forward / Add Member button */}
                {selectedContact.length > 0 && (
                    <View style={SelectContactsStyles.bottomBar}>
                        <TouchableOpacity
                            style={SelectContactsStyles.nextBtn}
                            onPress={handleNext}
                            activeOpacity={0.85}
                        >
                            <Text style={SelectContactsStyles.nextBtnText}>{btnLabel}</Text>
                            <View style={SelectContactsStyles.countBadge}>
                                <Text style={SelectContactsStyles.countBadgeText}>
                                    {selectedContact.length} selected
                                </Text>
                            </View>
                            <Ionicons name="arrow-forward" size={18} color="#fff" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}
