import { ContactContext } from "@/contexts/FriendContactContext";
import { convBlockMember, convUnblockMember, getConversationInfoId, leaveGroupByID, removeGroupMembers, updateGroupAdmin, updateGroupProfileName } from "@/db/conversationRepo";
import { clearMessageById } from "@/db/messageRepo";
import { colors, font, radius, shadow } from "@/theme";
import { CHATAPI } from "@/utils/api";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useContext, useState } from "react";
import { ActivityIndicator, Alert, Animated, Dimensions, Image, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { getGlobalUsername, setGlobalDbTick } from "@/utils/globalRefs";
import { useDbUpdate } from "@/contexts/DbUpdateContext";

const DEFAULT_AVATAR = require("../../assets/images/user.png");

export default function RoomDetailsScreen() {
    const { dbTick } = useDbUpdate();
    const { id } = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const SCREEN_HEIGHT = Dimensions.get("window").height;
    const slideAnim = useState(new Animated.Value(SCREEN_HEIGHT))[0];
    const { viewName } = useContext(ContactContext);
    const username = getGlobalUsername();
    const [reload, setReload] = useState<any>(false);
    const [otherUser, setOtherUser] = useState<any>(null);
    const [type, setType] = useState("single");
    const [about, setAbout] = useState<any>({});
    const [members, setMembers] = useState<any>([]);
    const [removedMembers, setRemovedMembers] = useState<any>([]);
    const [admins, setAdmins] = useState<any>([]);
    const [showDetails, setShowDetails] = useState<any>(null);
    const [uploading, setUploading] = useState(false);

    useFocusEffect(
        useCallback(() => {
            setReload(false);
            (async () => {
                const token = await AsyncStorage.getItem("token");
                if (!token) return router.replace("/");

                let res: any = await getConversationInfoId(id as string);
                setRemovedMembers(JSON.parse(res?.removedMembers) || []);
                setMembers(JSON.parse(res?.members).map((dat: any, idx: number) => ({ id: idx, name: dat })));
                setAdmins(JSON.parse(res?.admins) || []);
                setAbout({
                    name: res?.name,
                    description: res?.groupDescription,
                    image: res?.avatar,
                    disappearing: res?.disappearingMessages,
                    disappearingTime: res?.disappearingMessagesTime,
                    destructingMessagesTime: res?.destructingMessagesTime,
                    blockedBy: JSON.parse(res?.blockedBy),
                    blocked: res?.blocked,
                })
                setType(res?.type)
                setOtherUser(JSON.parse(res?.members)?.find((m: any) => m != username))
            })()
        }, [id, reload, dbTick])
    );

    const getUserProfile = (memberId: any) => {
        const details = viewName.get(memberId);
        if (!details) {
            return {
                name: memberId,
                phone: memberId,
                profile_image: ""
            };
        }
        return details;
    }

    // Non-contacts are shown by their profile name, so also show the number.
    const showNumberWithName = (memberId: any) => {
        const details = viewName?.get(memberId);
        return !!details && !details.isContact && !!details.name && details.name !== memberId;
    }

    const displayName = (memberId: any) => {
        if (memberId === username) return "You";
        const profile = getUserProfile(memberId);
        return showNumberWithName(memberId) ? `~${profile?.name}` : profile?.name || memberId;
    }

    const avatarOf = (memberId: any) => {
        const uri = getUserProfile(memberId)?.profile_image;
        return uri ? { uri } : DEFAULT_AVATAR;
    }

    const openMemberSheet = (member: any) => {
        setShowDetails(member);

        Animated.timing(slideAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
        }).start();
    };

    const closeMemberSheet = () => {
        Animated.timing(slideAnim, {
            toValue: SCREEN_HEIGHT,
            duration: 200,
            useNativeDriver: true,
        }).start(() => setShowDetails(null));
    };

    const isAdmin = (num: string) => admins.includes(num);

    const blockMember = async () => {
        try {
            const res = await CHATAPI.post(`/chats/blockUser`, {
                no: otherUser,
                conversationId: id
            });
            if (res.success == true || res.statusCode == 200) {
                convBlockMember(id as string, username as string);
                setGlobalDbTick();
            }
            else {
                Alert.alert(res.message);
            }
        }
        catch (err: any) {
            Alert.alert("error", err?.message);
        }
    }

    const unblockMember = async () => {
        try {
            const res = await CHATAPI.post(`/chats/unblockUser`, {
                no: otherUser,
                conversationId: id
            });
            if (res.success == true || res.statusCode == 200) {
                convUnblockMember(id as string, username as string);
                setGlobalDbTick();
            }
            else {
                Alert.alert(res.message);
            }
        }
        catch (err: any) {
            Alert.alert("error", err?.message);
        }
    }

    const leaveGroup = async () => {
        try {
            await leaveGroupByID(id as string, username as string);
            const res = await CHATAPI.get(`/chats/leaveConversation/${id}`);
            if (res.success == true || res.statusCode == 200) {
                setGlobalDbTick();
            }
            else {
                Alert.alert(res.message);
            }
        }
        catch (err: any) {
            Alert.alert("error", err?.message);
        }
    }

    const makeRemoveAdmin = async (memberId: string) => {
        try {
            const res = await CHATAPI.post(`/chats/addRemoveAdmin`, {
                conversationId: id,
                member: memberId,
                add: isAdmin(memberId) ? false : true,
            });
            if (res.success == true || res.statusCode == 200) {
                await updateGroupAdmin(res.data.conversationId, res.data.admins);
                setReload(true);
                closeMemberSheet();
            }
            else {
                Alert.alert(res.message);
            }
        }
        catch (err: any) {
            Alert.alert("error", err?.message);
        }
    }

    const removeMember = async (memberId: string) => {
        try {
            const res = await CHATAPI.post(`/chats/removeMembersInConversation`, {
                conversationId: id,
                member: memberId,
            });
            if (res.success == true || res.statusCode == 200) {
                await removeGroupMembers(res.data.conversationId, res.data.members, res.data.removedMember);
                setReload(true);
                closeMemberSheet();
            }
            else {
                Alert.alert(res.message);
            }
        }
        catch (err: any) {
            Alert.alert("error", err?.message);
        }
    }

    const pickImage = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
            Alert.alert('Permission required', 'Permission to access the media library is required.');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 1,
        });

        if (!result.assets) return;
        handleUpload(result);
    };

    const handleUpload = async (tempFiles: any) => {
        if (!tempFiles.assets?.length) return;

        const formData = new FormData();

        formData.append("image", {
            uri: tempFiles.assets[0].uri,
            name: tempFiles.assets[0].fileName || "photo.jpg",
            type: tempFiles.assets[0].mimeType || "image/jpeg",
        } as any);
        formData.append("conversationId", id as string);

        setUploading(true);
        try {
            const res = await CHATAPI.post("/chats/updateGroupProfileName", formData, {
                "Content-Type": "multipart/form-data",
            });
            if (res.data) {
                await updateGroupProfileName(res.data.conversationId, res.data.name, res.data.avatar);
            }
            setReload(true);
        } catch (err: any) {
            Alert.alert("Couldn't update group photo", err?.message || "Try again.");
        } finally {
            setUploading(false);
        }
    };

    const clearChat = async () => {
        Alert.alert(
            "Clear this chat?",
            "All messages in this chat will be deleted from this device.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Clear chat",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await clearMessageById(id as string);
                            setGlobalDbTick();
                            Alert.alert("Chat cleared");
                        } catch (err) {
                            console.error("Error deleting chats:", err);
                            Alert.alert("Error deleting chats");
                        }
                    },
                },
            ]
        );
    };

    const confirmBlock = () => {
        const name = getUserProfile(otherUser)?.name || otherUser;
        Alert.alert(`Block ${name}?`, "Blocked contacts can't message you in this chat.", [
            { text: "Cancel", style: "cancel" },
            { text: "Block", style: "destructive", onPress: blockMember },
        ]);
    };

    const confirmLeave = () => {
        Alert.alert(`Exit "${about?.name || "group"}"?`, "You'll stop receiving messages from this group.", [
            { text: "Cancel", style: "cancel" },
            { text: "Exit", style: "destructive", onPress: leaveGroup },
        ]);
    };

    const isGroup = type == "group";
    const amRemoved = removedMembers?.includes(username);
    const blockedByMe = about.blocked == "1" && about.blockedBy?.includes(username);
    const iAmAdmin = isAdmin(username as string);
    const title = isGroup ? about?.name : getUserProfile(otherUser)?.name;
    const disappearingValue = about.disappearing == "1" && about.disappearingTime != "0s" ? about.disappearingTime : "Off";
    const destructingValue = about.disappearing == "1" && about.destructingMessagesTime != "0s" ? about.destructingMessagesTime : "Off";
    // Admins first, then everyone else
    const sortedMembers = [...members].sort((a: any, b: any) => Number(isAdmin(b.name)) - Number(isAdmin(a.name)));
    const sheetMember = showDetails?.name;

    return (
        <SafeAreaView style={s.container} edges={["top", "left", "right"]}>
            <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.headerBtn} accessibilityLabel="Back">
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={s.headerTitle}>{isGroup ? "Group info" : "Contact info"}</Text>
                <View style={s.headerBtn} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
                {/* Profile */}
                <View style={s.hero}>
                    <View>
                        <Image source={isGroup ? (about.image ? { uri: about.image } : DEFAULT_AVATAR) : avatarOf(otherUser)} style={s.heroAvatar} />
                        {isGroup && !amRemoved && (
                            <TouchableOpacity style={s.cameraBadge} onPress={pickImage} disabled={uploading} accessibilityLabel="Change group photo">
                                {uploading
                                    ? <ActivityIndicator size="small" color={colors.textOnPrimary} />
                                    : <Ionicons name="camera" size={16} color={colors.textOnPrimary} />}
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text style={s.heroName} numberOfLines={2}>{title || " "}</Text>
                    {!isGroup && !!otherUser && otherUser !== title && <Text style={s.heroSub}>{otherUser}</Text>}
                    {isGroup && <Text style={s.heroSub}>Group · {members.length} {members.length === 1 ? "member" : "members"}</Text>}

                    <View style={s.actions}>
                        {!amRemoved && <Action icon="call-outline" label="Audio" />}
                        {!amRemoved && <Action icon="videocam-outline" label="Video" />}
                        <Action icon="search-outline" label="Search" />
                    </View>
                </View>

                {isGroup && !!about.description && (
                    <Section title="Description">
                        <Text style={s.description}>{about.description}</Text>
                    </Section>
                )}

                <Section>
                    <Row icon="images-outline" label="Media, links & docs" />
                    <Row icon="notifications-outline" label="Notifications" value="On" />
                    {!isGroup && (
                        <>
                            <Row
                                icon="timer-outline"
                                label="Disappearing messages"
                                value={disappearingValue}
                                onPress={() => router.push({ pathname: '/screens/disappearingMsgs', params: { id } })}
                            />
                            <Row
                                icon="flame-outline"
                                label="Self-destructing messages"
                                value={destructingValue}
                                onPress={() => router.push({ pathname: '/screens/selfDestructingMsgs', params: { id } })}
                            />
                        </>
                    )}
                    <Row icon="lock-closed-outline" label="Encryption" value="End-to-end" last />
                </Section>

                {/* Members */}
                {isGroup && (
                    <Section title={`${members.length} ${members.length === 1 ? "member" : "members"}`}>
                        {iAmAdmin && !amRemoved && (
                            <TouchableOpacity
                                style={s.memberRow}
                                onPress={() => router.navigate({
                                    pathname: "/screens/createGroup/selectContacts",
                                    params: { addMemberInGroup: `${true}`, conversationId: id },
                                })}
                            >
                                <View style={[s.memberAvatar, s.addAvatar]}>
                                    <Ionicons name="person-add-outline" size={20} color={colors.primary} />
                                </View>
                                <Text style={[s.memberName, { color: colors.primary, fontWeight: "600" }]}>Add members</Text>
                            </TouchableOpacity>
                        )}
                        {sortedMembers.map((m: any, index: number) => (
                            <TouchableOpacity
                                key={`member-${m.name}`}
                                style={[s.memberRow, index === sortedMembers.length - 1 && { borderBottomWidth: 0 }]}
                                onPress={() => openMemberSheet(m)}
                                activeOpacity={0.7}
                            >
                                <Image source={avatarOf(m.name)} style={s.memberAvatar} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[s.memberName, showNumberWithName(m.name) && m.name !== username && { color: colors.textSecondary }]} numberOfLines={1}>
                                        {displayName(m.name)}
                                    </Text>
                                    {showNumberWithName(m.name) && m.name !== username && (
                                        <Text style={s.memberSub}>{m.name}</Text>
                                    )}
                                </View>
                                {isAdmin(m.name) && (
                                    <View style={s.adminBadge}>
                                        <Text style={s.adminBadgeText}>Admin</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        ))}
                    </Section>
                )}

                {/* Danger zone */}
                <Section>
                    <Row icon="trash-outline" label="Clear chat" danger onPress={clearChat} last={isGroup ? amRemoved : false} />
                    {!isGroup && (blockedByMe
                        ? <Row icon="checkmark-circle-outline" label={`Unblock ${getUserProfile(otherUser)?.name || ""}`.trim()} onPress={unblockMember} last />
                        : <Row icon="ban-outline" label={`Block ${getUserProfile(otherUser)?.name || ""}`.trim()} danger onPress={confirmBlock} last />
                    )}
                    {isGroup && !amRemoved && <Row icon="log-out-outline" label="Exit group" danger onPress={confirmLeave} last />}
                </Section>
                {isGroup && amRemoved && <Text style={s.footnote}>You are no longer a member of this group.</Text>}
            </ScrollView>

            {/* Member actions */}
            <Modal transparent visible={!!showDetails} animationType="none" onRequestClose={closeMemberSheet} statusBarTranslucent>
                <Pressable style={s.backdrop} onPress={closeMemberSheet} />
                <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] }]}>
                    <View style={s.sheetHandle} />

                    <View style={s.sheetProfile}>
                        <Image source={avatarOf(sheetMember)} style={s.sheetAvatar} />
                        <View style={{ flex: 1 }}>
                            <Text style={s.sheetName} numberOfLines={1}>{sheetMember ? displayName(sheetMember) : ""}</Text>
                            <Text style={s.memberSub}>{sheetMember}{isAdmin(sheetMember) ? " · Group admin" : ""}</Text>
                        </View>
                    </View>

                    {iAmAdmin && sheetMember !== username && (
                        <View style={s.sheetCard}>
                            <SheetItem
                                icon={isAdmin(sheetMember) ? "person-remove-outline" : "shield-checkmark-outline"}
                                label={isAdmin(sheetMember) ? "Dismiss as admin" : "Make group admin"}
                                onPress={() => makeRemoveAdmin(sheetMember)}
                            />
                            <SheetItem icon="remove-circle-outline" label="Remove from group" danger last onPress={() => removeMember(sheetMember)} />
                        </View>
                    )}

                    <TouchableOpacity style={s.cancelBtn} onPress={closeMemberSheet}>
                        <Text style={s.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                </Animated.View>
            </Modal>
        </SafeAreaView>
    );
}

const Action = ({ icon, label, onPress }: any) => (
    <TouchableOpacity style={s.actionBtn} onPress={onPress} activeOpacity={0.7}>
        <Ionicons name={icon} size={22} color={colors.primary} />
        <Text style={s.actionLabel}>{label}</Text>
    </TouchableOpacity>
);

const Section = ({ title, children }: any) => (
    <View style={s.section}>
        {!!title && <Text style={s.sectionTitle}>{title}</Text>}
        <View style={s.card}>{children}</View>
    </View>
);

const Row = ({ icon, label, value, onPress, danger, last }: any) => (
    <Pressable
        style={({ pressed }) => [s.row, last && { borderBottomWidth: 0 }, pressed && !!onPress && { backgroundColor: colors.surfaceAlt }]}
        onPress={onPress}
        disabled={!onPress}
    >
        <View style={[s.rowIcon, danger && { backgroundColor: colors.dangerSoft }]}>
            <Ionicons name={icon} size={19} color={danger ? colors.danger : colors.primary} />
        </View>
        <Text style={[s.rowLabel, danger && { color: colors.danger }]} numberOfLines={1}>{label}</Text>
        {!!value && <Text style={s.rowValue}>{value}</Text>}
        {!!onPress && !danger && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </Pressable>
);

const SheetItem = ({ icon, label, danger, last, onPress }: any) => (
    <TouchableOpacity onPress={onPress} style={[s.row, last && { borderBottomWidth: 0 }]}>
        <View style={[s.rowIcon, danger && { backgroundColor: colors.dangerSoft }]}>
            <Ionicons name={icon} size={19} color={danger ? colors.danger : colors.primary} />
        </View>
        <Text style={[s.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
    </TouchableOpacity>
);

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 8,
        height: 56,
        backgroundColor: colors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    headerTitle: { fontSize: font.h2, fontWeight: "700", color: colors.text },

    hero: {
        alignItems: "center",
        backgroundColor: colors.surface,
        paddingTop: 24,
        paddingBottom: 20,
        paddingHorizontal: 20,
        borderBottomLeftRadius: radius.xl,
        borderBottomRightRadius: radius.xl,
        ...shadow(1),
    },
    heroAvatar: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.surfaceAlt, borderWidth: 3, borderColor: colors.primarySoft },
    cameraBadge: {
        position: "absolute",
        right: 2,
        bottom: 2,
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 3,
        borderColor: colors.surface,
    },
    heroName: { fontSize: font.h1, fontWeight: "700", color: colors.text, marginTop: 14, textAlign: "center" },
    heroSub: { fontSize: font.small + 1, color: colors.textSecondary, marginTop: 4 },
    actions: { flexDirection: "row", gap: 12, marginTop: 20, alignSelf: "stretch", justifyContent: "center" },
    actionBtn: {
        flex: 1,
        maxWidth: 110,
        alignItems: "center",
        paddingVertical: 12,
        borderRadius: radius.md,
        backgroundColor: colors.primarySoft,
    },
    actionLabel: { fontSize: font.small - 1, color: colors.primaryDark, marginTop: 4, fontWeight: "600" },

    section: { paddingHorizontal: 16, marginTop: 18 },
    sectionTitle: {
        fontSize: font.small - 1,
        fontWeight: "700",
        color: colors.textSecondary,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginBottom: 8,
        marginLeft: 4,
    },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", ...shadow(1) },
    description: { fontSize: font.body, color: colors.text, lineHeight: 21, padding: 16 },

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
    rowValue: { fontSize: font.small, color: colors.textSecondary, maxWidth: 120 },

    memberRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.divider,
    },
    memberAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt },
    addAvatar: { backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
    memberName: { fontSize: font.body, color: colors.text, fontWeight: "500" },
    memberSub: { fontSize: font.small - 1, color: colors.textSecondary, marginTop: 2 },
    adminBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
    adminBadgeText: { fontSize: font.tiny, fontWeight: "700", color: colors.primaryDark },

    footnote: { textAlign: "center", color: colors.textMuted, fontSize: font.small, marginTop: 12 },

    backdrop: { flex: 1, backgroundColor: colors.overlay },
    sheet: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.background,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        paddingHorizontal: 16,
        paddingTop: 10,
    },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.primaryMuted, alignSelf: "center", marginBottom: 16 },
    sheetProfile: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16, paddingHorizontal: 4 },
    sheetAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceAlt },
    sheetName: { fontSize: font.h2, fontWeight: "700", color: colors.text },
    sheetCard: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", marginBottom: 12, ...shadow(1) },
    cancelBtn: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 14, alignItems: "center", ...shadow(1) },
    cancelText: { fontSize: font.body, fontWeight: "600", color: colors.text },
});
