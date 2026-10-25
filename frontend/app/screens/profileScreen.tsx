import { AuthAPI, apiErrorMessage } from "@/utils/api";
import { AuthUser, saveUser } from "@/utils/session";
import { normalizeUsername, usernameStatusText, useUsernameStatus } from "@/utils/username";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProfileStyles, SettingsStyle } from "../styles";
import { colors } from "@/theme";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];
type EditField = "name" | "about" | "username" | "email";

const ABOUT_MAX = 140;

// ── Field row ──────────────────────────────────────────────────────────────
function Field({ icon, label, value, placeholder, onPress }: {
    icon: IoniconsName;
    label: string;
    value?: string | null;
    placeholder?: string;
    onPress?: () => void;
}) {
    return (
        <TouchableOpacity style={ProfileStyles.field} onPress={onPress} disabled={!onPress} activeOpacity={0.6}>
            <View style={[SettingsStyle.iconBox, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name={icon} size={18} color={colors.primary} />
            </View>
            <View style={ProfileStyles.fieldText}>
                <Text style={ProfileStyles.fieldLabel}>{label}</Text>
                {value
                    ? <Text style={ProfileStyles.fieldValue}>{value}</Text>
                    : <Text style={ProfileStyles.fieldPlaceholder}>{placeholder}</Text>}
            </View>
            {onPress && <Ionicons name="create-outline" size={18} color={colors.primary} />}
        </TouchableOpacity>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
    const router = useRouter();
    const [user, setUser] = useState<Partial<AuthUser>>({});
    const [editing, setEditing] = useState<EditField | null>(null);
    const [draft, setDraft] = useState({ first_name: "", last_name: "", about: "", username: "", email: "" });
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const usernameStatus = useUsernameStatus(editing === "username" ? draft.username : "", user.username);
    const usernameText = usernameStatusText(usernameStatus);

    const applyUser = async (u: AuthUser) => {
        setUser(u);
        await saveUser(u);
    };

    useEffect(() => {
        (async () => {
            // Show the cached profile right away, then refresh it from the server
            const [phone, username, first_name, last_name, about, email, profile_image] = (
                await AsyncStorage.multiGet(["username", "userHandle", "first_name", "last_name", "about", "email", "profile"])
            ).map(([, v]) => v || null);
            setUser({ phone: phone ?? "", username, first_name: first_name ?? "", last_name: last_name ?? "", about: about ?? "", email, profile_image });
            try {
                const res = await AuthAPI.get("/profile/me");
                await applyUser(res.data.user);
            } catch (err) {
                console.info("profile refresh failed", err);
            }
        })();
    }, []);

    const openEditor = (field: EditField) => {
        setDraft({
            first_name: user.first_name ?? "",
            last_name: user.last_name ?? "",
            about: user.about ?? "",
            username: user.username ?? "",
            email: user.email ?? "",
        });
        setEditing(field);
    };

    const canSave = (() => {
        if (saving) return false;
        switch (editing) {
            case "name": return draft.first_name.trim().length > 0;
            case "username": return usernameStatus.state === "available";
            case "email": return draft.email.trim() === "" || /^\S+@\S+\.\S+$/.test(draft.email.trim());
            default: return true;
        }
    })();

    const save = async () => {
        if (!editing || !canSave) return;
        setSaving(true);
        try {
            if (editing === "username") {
                const res = await AuthAPI.patch("/profile/username", { username: normalizeUsername(draft.username) });
                await AsyncStorage.setItem("token", res.data.accessToken); // token carries the username
                await applyUser(res.data.user);
            } else {
                const body =
                    editing === "name" ? { first_name: draft.first_name.trim(), last_name: draft.last_name.trim() }
                        : editing === "about" ? { about: draft.about.trim() }
                            : { email: draft.email.trim() || null };
                const res = await AuthAPI.patch("/profile/me", body);
                await applyUser(res.data.user);
            }
            setEditing(null);
        } catch (err: any) {
            Alert.alert("Couldn't save", apiErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const pickPhoto = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];

        const formData = new FormData();
        formData.append("profile_image", {
            uri: asset.uri,
            name: asset.fileName || "photo.jpg",
            type: asset.mimeType || "image/jpeg",
        } as any);

        setUploading(true);
        try {
            const res = await AuthAPI.patch("/profile/update-profile-image", formData, {
                "Content-Type": "multipart/form-data",
            });
            await applyUser(res.data.user);
        } catch (err: any) {
            Alert.alert("Couldn't update photo", apiErrorMessage(err));
        } finally {
            setUploading(false);
        }
    };

    const removePhoto = () => {
        Alert.alert("Remove profile photo?", undefined, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Remove",
                style: "destructive",
                onPress: async () => {
                    setUploading(true);
                    try {
                        const res = await AuthAPI.delete("/profile/profile-image");
                        await applyUser(res.data.user);
                    } catch (err: any) {
                        Alert.alert("Couldn't remove photo", apiErrorMessage(err));
                    } finally {
                        setUploading(false);
                    }
                },
            },
        ]);
    };

    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
            <View style={SettingsStyle.root}>
                <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

                {/* ── Header ── */}
                <View style={SettingsStyle.header}>
                    <TouchableOpacity style={SettingsStyle.backBtn} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={SettingsStyle.headerTitle}>Profile</Text>
                </View>

                <ScrollView contentContainerStyle={SettingsStyle.scroll} showsVerticalScrollIndicator={false}>

                    {/* ── Photo ── */}
                    <View style={ProfileStyles.avatarWrap}>
                        <TouchableOpacity onPress={pickPhoto} activeOpacity={0.85} disabled={uploading}>
                            <View style={ProfileStyles.avatar}>
                                {user.profile_image
                                    ? <Image source={{ uri: user.profile_image }} style={ProfileStyles.avatarImage} />
                                    : <Ionicons name="person" size={64} color={colors.primary} />}
                                {uploading && (
                                    <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" }]}>
                                        <ActivityIndicator color="#FFFFFF" />
                                    </View>
                                )}
                            </View>
                            <View style={ProfileStyles.avatarBadge}>
                                <Ionicons name="camera" size={18} color="#FFFFFF" />
                            </View>
                        </TouchableOpacity>
                        {user.profile_image && !uploading && (
                            <TouchableOpacity onPress={removePhoto}>
                                <Text style={ProfileStyles.removePhoto}>Remove photo</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* ── Basic info ── */}
                    <View style={SettingsStyle.section}>
                        <View style={SettingsStyle.sectionCard}>
                            <Field icon="person-outline" label="Name" value={fullName} placeholder="Add your name" onPress={() => openEditor("name")} />
                            <View style={SettingsStyle.divider} />
                            <Field icon="information-circle-outline" label="About" value={user.about} placeholder="Add a few words about yourself" onPress={() => openEditor("about")} />
                        </View>
                    </View>
                    <Text style={ProfileStyles.note}>Your name and photo are visible to your contacts.</Text>

                    {/* ── Account ── */}
                    <View style={SettingsStyle.section}>
                        <Text style={SettingsStyle.sectionTitle}>ACCOUNT</Text>
                        <View style={SettingsStyle.sectionCard}>
                            <Field icon="at-circle-outline" label="Username" value={user.username ? `@${user.username}` : null} placeholder="Choose a username" onPress={() => openEditor("username")} />
                            <View style={SettingsStyle.divider} />
                            <Field icon="mail-outline" label="Email" value={user.email} placeholder="Add email (optional)" onPress={() => openEditor("email")} />
                            <View style={SettingsStyle.divider} />
                            <Field icon="call-outline" label="Phone" value={user.phone ? `+${user.phone}` : null} />
                        </View>
                    </View>
                    <Text style={ProfileStyles.note}>{"People can find you by your username. Your phone number is used to log in and can't be changed here."}</Text>
                </ScrollView>
            </View>

            {/* ── Edit sheet ── */}
            <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
                    <Pressable style={ProfileStyles.backdrop} onPress={() => setEditing(null)}>
                        <Pressable style={ProfileStyles.sheet} onPress={() => { }}>
                            {editing === "name" && (
                                <>
                                    <Text style={ProfileStyles.sheetTitle}>Edit name</Text>
                                    <TextInput style={ProfileStyles.sheetInput} value={draft.first_name} placeholder="First name"
                                        onChangeText={(v) => setDraft({ ...draft, first_name: v })} maxLength={50} autoFocus autoCapitalize="words" />
                                    <TextInput style={ProfileStyles.sheetInput} value={draft.last_name} placeholder="Last name (optional)"
                                        onChangeText={(v) => setDraft({ ...draft, last_name: v })} maxLength={50} autoCapitalize="words" />
                                </>
                            )}
                            {editing === "about" && (
                                <>
                                    <Text style={ProfileStyles.sheetTitle}>Edit about</Text>
                                    <TextInput style={ProfileStyles.sheetInput} value={draft.about} placeholder="About"
                                        onChangeText={(v) => setDraft({ ...draft, about: v })} maxLength={ABOUT_MAX} autoFocus multiline />
                                    <Text style={ProfileStyles.sheetCount}>{draft.about.length}/{ABOUT_MAX}</Text>
                                </>
                            )}
                            {editing === "username" && (
                                <>
                                    <Text style={ProfileStyles.sheetTitle}>Change username</Text>
                                    <TextInput style={ProfileStyles.sheetInput} value={draft.username} placeholder="username"
                                        onChangeText={(v) => setDraft({ ...draft, username: v.replace(/\s/g, "") })}
                                        maxLength={21} autoFocus autoCapitalize="none" autoCorrect={false} />
                                    {usernameText && (
                                        <Text style={[ProfileStyles.status, usernameText.ok ? ProfileStyles.statusOk : ProfileStyles.statusBad]}>
                                            {usernameText.text}
                                        </Text>
                                    )}
                                </>
                            )}
                            {editing === "email" && (
                                <>
                                    <Text style={ProfileStyles.sheetTitle}>Email</Text>
                                    <TextInput style={ProfileStyles.sheetInput} value={draft.email} placeholder="you@example.com"
                                        onChangeText={(v) => setDraft({ ...draft, email: v })} maxLength={254} autoFocus
                                        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                                    <Text style={ProfileStyles.sheetCount}>Leave empty to remove</Text>
                                </>
                            )}

                            <View style={ProfileStyles.sheetActions}>
                                <TouchableOpacity onPress={() => setEditing(null)}>
                                    <Text style={ProfileStyles.sheetCancel}>Cancel</Text>
                                </TouchableOpacity>
                                {saving
                                    ? <ActivityIndicator color={colors.primary} />
                                    : (
                                        <TouchableOpacity onPress={save} disabled={!canSave}>
                                            <Text style={[ProfileStyles.sheetSave, !canSave && ProfileStyles.btnDisabled]}>Save</Text>
                                        </TouchableOpacity>
                                    )}
                            </View>
                        </Pressable>
                    </Pressable>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}
