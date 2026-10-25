import { colors } from "@/theme";
import { saveConversation, updateConversationLastMessage } from "@/db/conversationRepo";
import { saveMessage } from "@/db/messageRepo";
import { CHATAPI } from "@/utils/api";
import * as Crypto from 'expo-crypto';
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CreateGroupStyles } from "../../styles";
import { Ionicons } from "@expo/vector-icons";
import { getGlobalSocket, getGlobalUsername, setGlobalDbTick } from "@/utils/globalRefs";

export default function CreateGroup() {
    const socket = getGlobalSocket();
    const username = getGlobalUsername();
    const { selectedContact } = useLocalSearchParams();
    const [groupName, setGroupName] = useState("");
    const [description, setDescription] = useState("");
    const [groupIcon, setGroupIcon] = useState<any>(null);
    const [selected, setSelected] = useState<any>([]);
    const [loader, setLoader] = useState<boolean>(false);

    useEffect(() => {
        (async () => {
            setSelected(JSON.parse(selectedContact as string))
        })()
    }, [selectedContact])

    const pickIcon = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 1,
        });
        if (!result.canceled) setGroupIcon(result.assets[0]);
    };

    const onCreate = async () => {
        setLoader(true);
        if (!groupName.trim()) {
            alert("Please enter group name");
            setLoader(false);
            return;
        }

        const formData = new FormData();
        formData.append("type", "group");
        formData.append("name", groupName.trim());
        formData.append("description", description.trim());
        selected.forEach((user: any) => {
            formData.append("memberIds[]", user.phone);
        });
        groupIcon && formData.append("image", {
            uri: groupIcon.uri,
            name: groupIcon.fileName || "photo.jpg",
            type: groupIcon.mimeType || "image/jpeg",
        } as any);

        try {
            const config: any = { "Content-Type": "multipart/form-data" };
            const response = await CHATAPI.post("/chats/createConversations", formData, config);
            if (response.data) {
                const conv = response.data.conv;
                // const conv = response.data;
                let actualMsg = { msg: "group created", data: { ...conv } };
                const socketData = {
                    messageId: Crypto.randomUUID(),
                    conversationId: conv._id,
                    senderId: username,
                    content: actualMsg,
                    messageType: "group_create",
                    conv_type: "group",
                    timestamp: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }

                // DB: insert into local database (conversations table)
                await saveConversation({
                    ...conv,
                    timestamp: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });

                await saveMessage(socketData);
                await updateConversationLastMessage({
                    id: conv._id,
                    lastMessageId: socketData.messageId,
                    lastMessage: socketData.content.msg,
                    lastMessageType: socketData.messageType,
                    lastMessageSenderId: username,
                    lastMessageStatus: "sent",
                    lastMessageDate: new Date().toISOString(),
                }, username!);
                setGlobalDbTick();
                socket?.emit("chat:send-message", socketData);
                setLoader(false);
                router.dismiss(2);
            }
        } catch (error: any) {
            setLoader(false);
            console.error("Group Created:", error.response?.data || error.message);
        }
    };

    return (
        <SafeAreaView style={CreateGroupStyles.safeArea}>
            <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

            <View style={CreateGroupStyles.header}>
                <TouchableOpacity onPress={() => router.back()} style={CreateGroupStyles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={CreateGroupStyles.headerTitle.color} />
                </TouchableOpacity>
                <Text style={CreateGroupStyles.headerTitle}>Create Group</Text>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
                style={{ flex: 1 }}
            >
                <ScrollView
                    style={CreateGroupStyles.scrollBg}
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: 30 }}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={CreateGroupStyles.card}>
                        <TouchableOpacity onPress={pickIcon} style={CreateGroupStyles.iconPickerWrap}>
                            {groupIcon ? (
                                <Image source={{ uri: groupIcon.uri }} style={CreateGroupStyles.iconImage} />
                            ) : (
                                <>
                                    <Ionicons name="camera-outline" size={30} color={colors.primary} />
                                    <Text style={CreateGroupStyles.iconAddText}>Add Photo</Text>
                                </>
                            )}
                        </TouchableOpacity>
                        <Text style={CreateGroupStyles.iconLabel}>Tap to select group icon</Text>
                    </View>

                    <View style={[CreateGroupStyles.card, { marginTop: 8 }]}>
                        <Text style={CreateGroupStyles.fieldLabel}>GROUP NAME *</Text>
                        <View style={CreateGroupStyles.inputRow}>
                            <Ionicons name="people" size={16} color={CreateGroupStyles.iconAddText.color} />
                            <TextInput
                                style={CreateGroupStyles.input}
                                placeholder="Enter group name"
                                placeholderTextColor={CreateGroupStyles.iconAddText.color}
                                value={groupName}
                                onChangeText={setGroupName}
                            />
                            {groupName.length > 0 && (
                                <Text style={CreateGroupStyles.charCount}>{groupName.length}/25</Text>
                            )}
                        </View>
                    </View>

                    <View style={[CreateGroupStyles.card, { marginTop: 8 }]}>
                        <Text style={CreateGroupStyles.fieldLabel}>
                            DESCRIPTION{' '}
                            <Text style={CreateGroupStyles.fieldLabelOptional}>(OPTIONAL)</Text>
                        </Text>
                        <View style={[CreateGroupStyles.inputRow, { alignItems: 'flex-start' }]}>
                            <Ionicons
                                name="document-text"
                                size={16}
                                color={CreateGroupStyles.iconAddText.color}
                                style={{ marginTop: 3 }}
                            />
                            <TextInput
                                style={[CreateGroupStyles.input, CreateGroupStyles.textArea]}
                                placeholder="Enter group description"
                                placeholderTextColor={CreateGroupStyles.iconAddText.color}
                                value={description}
                                onChangeText={setDescription}
                                multiline
                                numberOfLines={3}
                            />
                        </View>
                    </View>

                    <View style={[CreateGroupStyles.card, { marginTop: 8 }]}>
                        <Text style={CreateGroupStyles.fieldLabel}>
                            MEMBERS{' '}
                            <Text style={CreateGroupStyles.fieldLabelOptional}>({selected.length})</Text>
                        </Text>
                        <FlatList
                            horizontal
                            data={selected}
                            keyExtractor={item => item.phone}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ gap: 14, paddingTop: 10 }}
                            renderItem={({ item }) => (
                                <View style={CreateGroupStyles.memberItem}>
                                    <View style={CreateGroupStyles.memberAvatarWrap}>
                                        <Image
                                            source={{
                                                uri:
                                                    item.profile_image ||
                                                    `https://ui-avatars.com/api/?name=${item.name || item.phone}&background=075E54&color=fff`,
                                            }}
                                            style={CreateGroupStyles.memberAvatar}
                                        />
                                    </View>
                                    <Text style={CreateGroupStyles.memberName} numberOfLines={1}>
                                        {(item.name || item.phone).split(' ')[0]}
                                    </Text>
                                </View>
                            )}
                            ListFooterComponent={
                                <TouchableOpacity
                                    style={CreateGroupStyles.memberItem}
                                    onPress={() => router.back()}
                                >
                                    <View style={CreateGroupStyles.addMoreBtn}>
                                        <Ionicons name="add" size={22} color={CreateGroupStyles.iconAddText.color} />
                                    </View>
                                    <Text style={CreateGroupStyles.memberName}>Add</Text>
                                </TouchableOpacity>
                            }
                        />
                    </View>
                    <View style={CreateGroupStyles.topBtnWrap}>
                        <View style={CreateGroupStyles.btnWrap}>
                            <TouchableOpacity
                                style={[
                                    CreateGroupStyles.createBtn,
                                    !groupName.trim() && CreateGroupStyles.createBtnDisabled,
                                ]}
                                onPress={onCreate}
                                activeOpacity={0.85}
                                disabled={!groupName.trim()}
                            >
                                <Ionicons name="people" size={18} color={colors.textOnPrimary} />
                                <Text style={CreateGroupStyles.createBtnText}>Create Group</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            {loader && (
                <View style={CreateGroupStyles.loaderOverlay}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            )}
        </SafeAreaView>
    );
}