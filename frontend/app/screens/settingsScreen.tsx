import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { reloadAppAsync } from "expo";
import {
    Alert,
    Linking,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SettingsStyle, styles } from "../styles";
import { colors, fontSizeSetting, FontSizeSetting, saveAppearance, statusBarStyle, themeSetting, ThemeSetting } from "@/theme";
import BottomSheet from "@/app/components/BottomSheet";
import { canUseAppLock, isAppLockOn, setAppLock, unlockWithBiometrics } from "@/utils/appLock";
import { logout } from "@/utils/socket";
import { AuthAPI, apiErrorMessage, CHATAPI } from "@/utils/api";
import { getGlobalSocket } from "@/utils/globalRefs";
import { onlineStatusOn, readReceiptsOn, setOnlineStatus, setReadReceipts } from "@/utils/privacy";
import { messageNotificationsOn, setMessageNotifications } from "@/utils/notificationSettings";
import { cacheSize, clearCache } from "@/utils/storage";
import { formatBytes } from "@/utils/media";
import notifee from "@notifee/react-native";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

interface SettingRowProps {
    icon: IoniconsName;
    iconColor?: string;
    label: string;
    value?: string;
    onPress?: () => void;
    showArrow?: boolean;
    danger?: boolean;
}

interface SettingToggleProps {
    icon: IoniconsName;
    iconColor?: string;
    label: string;
    value: boolean;
    onToggle: (v: boolean) => void;
}

function IconBox({ name, color = colors.primary }: { name: IoniconsName; color?: string }) {
    return (
        <View style={[SettingsStyle.iconBox, { backgroundColor: color + "18" }]}>
            <Ionicons name={name} size={18} color={color} />
        </View>
    );
}

function SettingRow({
    icon, iconColor = colors.primary, label, value,
    onPress, showArrow = true, danger = false,
}: SettingRowProps) {
    return (
        <TouchableOpacity style={SettingsStyle.row} onPress={onPress} activeOpacity={0.6}>
            <View style={SettingsStyle.rowLeft}>
                <IconBox name={icon} color={danger ? colors.danger : iconColor} />
                <Text style={[SettingsStyle.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
            </View>
            <View style={SettingsStyle.rowRight}>
                {value && <Text style={SettingsStyle.rowValue}>{value}</Text>}
                {showArrow && (
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                )}
            </View>
        </TouchableOpacity>
    );
}

function SettingToggle({ icon, iconColor = colors.primary, label, value, onToggle }: SettingToggleProps) {
    return (
        <View style={SettingsStyle.row}>
            <View style={SettingsStyle.rowLeft}>
                <IconBox name={icon} color={iconColor} />
                <Text style={SettingsStyle.rowLabel}>{label}</Text>
            </View>
            <Switch
                value={value}
                onValueChange={onToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
            />
        </View>
    );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
    return (
        <View style={SettingsStyle.section}>
            {title && <Text style={SettingsStyle.sectionTitle}>{title}</Text>}
            <View style={SettingsStyle.sectionCard}>{children}</View>
        </View>
    );
}

function Divider() {
    return <View style={SettingsStyle.divider} />;
}

type Choice = { value: string; label: string; sub: string };
// A bottom sheet with a few choices (theme, font size, profile photo)
type ChoiceSheet = { title: string; options: Choice[]; value: string; note?: string; onPick: (value: string) => void };

const THEME_OPTIONS: Choice[] = [
    { value: "system", label: "System default", sub: "Follows your phone's setting" },
    { value: "light", label: "Light", sub: "Light background" },
    { value: "dark", label: "Dark", sub: "Dark background, easier at night" },
];
const FONT_OPTIONS: Choice[] = [
    { value: "small", label: "Small", sub: "More fits on screen" },
    { value: "medium", label: "Medium", sub: "Default size" },
    { value: "large", label: "Large", sub: "Easier to read" },
];
const PHOTO_OPTIONS: Choice[] = [
    { value: "everyone", label: "Everyone", sub: "Anyone on the app can see your photo" },
    { value: "nobody", label: "Nobody", sub: "Your photo is hidden from everyone" },
];
const labelOf = (options: Choice[], value: string) =>
    options.find((o) => o.value === value)?.label ?? "";

export default function SettingsScreen() {
    const router = useRouter();
    const [info, setInfo] = useState<any>({});
    const [notifications, setNotifications] = useState(messageNotificationsOn);
    const [readReceipts, setReadReceiptsState] = useState(readReceiptsOn);
    const [onlineStatus, setOnlineStatusState] = useState(onlineStatusOn);
    const [photoVisibility, setPhotoVisibility] = useState("everyone");
    const [blockedCount, setBlockedCount] = useState<number | null>(null);
    const [sheet, setSheet] = useState<ChoiceSheet | null>(null);
    const [cacheBytes, setCacheBytes] = useState(0);
    const [biometric, setBiometric] = useState(isAppLockOn);
    const [twoStep, setTwoStep] = useState(false);

    // Confirm with a fingerprint both ways, so someone holding an unlocked phone can't just switch it off
    const toggleBiometric = async (on: boolean) => {
        if (on && !(await canUseAppLock())) {
            Alert.alert("Set up a screen lock first", "Add a fingerprint, face or PIN in your phone's settings to use Biometric Lock.");
            return;
        }
        if (!(await unlockWithBiometrics(on ? "Turn on Biometric Lock" : "Turn off Biometric Lock"))) return;
        setAppLock(on);
        setBiometric(on);
    };
    // Theme and font size: styles are built once at startup, so the app restarts to apply them
    const changeAppearance = (theme: ThemeSetting, fontSize: FontSizeSetting) => {
        if (theme === themeSetting && fontSize === fontSizeSetting) return;
        saveAppearance(theme, fontSize);
        setTimeout(() => reloadAppAsync("Appearance changed").catch(() => undefined), 250);
    };

    // Notifications
    const toggleNotifications = (on: boolean) => {
        setMessageNotifications(on);
        setNotifications(on);
    };
    // Message tone: Android's sound setting for chat notifications
    const openMessageTone = () =>
        notifee.openNotificationSettings("messages").catch(() => Alert.alert("Couldn't open sound settings"));
    // Calls ring with the phone's own ringtone, so this opens the phone's Sound settings
    const openCallRingtone = () =>
        Linking.sendIntent("android.settings.SOUND_SETTINGS").catch(() => Linking.openSettings());

    // Storage: how much the cache uses, and a button to clear it
    const askClearCache = () =>
        Alert.alert(
            "Clear cache?",
            `Frees ${formatBytes(cacheBytes) ?? "0 MB"}. Photos and videos download again when you open them. Your chats and messages are not deleted.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Clear",
                    style: "destructive",
                    onPress: async () => {
                        await clearCache();
                        setCacheBytes(cacheSize());
                    },
                },
            ],
        );

    // Privacy
    const toggleReadReceipts = (on: boolean) => {
        setReadReceipts(on);
        setReadReceiptsState(on);
    };
    const toggleOnlineStatus = (on: boolean) => {
        setOnlineStatus(on);
        setOnlineStatusState(on);
        getGlobalSocket()?.emit("privacy:online", { show: on }); // the server hides you right away
    };
    const changePhotoVisibility = async (value: string) => {
        try {
            await AuthAPI.patch("/profile/me", { photoVisibility: value });
            await AsyncStorage.setItem("photoVisibility", value);
            setPhotoVisibility(value);
        } catch (err) {
            Alert.alert("Couldn't save", apiErrorMessage(err));
        }
    };

    // Re-read on focus so edits made on the profile screen show up when coming back
    useFocusEffect(useCallback(() => {
        (async () => {
            const [phone, handle, first_name, last_name, about, profile] = (
                await AsyncStorage.multiGet(["username", "userHandle", "first_name", "last_name", "about", "profile"])
            ).map(([, v]) => v || "");
            setInfo({ phone, handle, first_name, last_name, about, profile });
            setTwoStep((await AsyncStorage.getItem("twoStepEnabled")) === "1");
            setPhotoVisibility((await AsyncStorage.getItem("photoVisibility")) || "everyone");
            setCacheBytes(cacheSize());
            CHATAPI.get("/chats/getblockedUser")
                .then((res) => setBlockedCount((res.data.blockedNo ?? []).length))
                .catch(() => setBlockedCount(null));
        })();
    }, []));

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
            <View style={SettingsStyle.root}>
                <StatusBar barStyle={statusBarStyle} backgroundColor={colors.surface} />

                {/* ── Header ── */}
                <View style={SettingsStyle.header}>
                    <TouchableOpacity style={SettingsStyle.backBtn} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={SettingsStyle.headerTitle}>Settings</Text>
                    {/* <TouchableOpacity style={SettingsStyle.searchBtn}>
                        <Ionicons name="search" size={22} color={colors.text} />
                    </TouchableOpacity> */}
                </View>

                <ScrollView contentContainerStyle={SettingsStyle.scroll} showsVerticalScrollIndicator={false}>

                    {/* ── Profile Card ── */}
                    <TouchableOpacity style={SettingsStyle.profileCard} activeOpacity={0.8}
                        onPress={() => router.navigate("/screens/profileScreen")}>
                        <View style={SettingsStyle.profileAvatar}>
                            {info.profile
                                ? <Image source={{ uri: info.profile }} style={{ width: 62, height: 62, borderRadius: 31 }} />
                                : <Ionicons name="person" size={32} color={colors.primary} />
                            }
                            <View style={styles.editBadge}>
                                <Ionicons name="pencil" size={12} color="#fff" />
                            </View>
                        </View>
                        <View style={SettingsStyle.profileInfo}>
                            <Text style={SettingsStyle.profileName}>
                                {[info.first_name, info.last_name].filter(Boolean).join(" ") || "Set your name"}
                            </Text>
                            <Text style={SettingsStyle.profileStatus} numberOfLines={1}>{info.about || "Add an about"}</Text>
                            <Text style={SettingsStyle.profilePhone}>
                                {info.handle ? `@${info.handle}` : info.phone ? `+${info.phone}` : ""}
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    </TouchableOpacity>

                    {/* ── Notifications ── */}
                    <Section title="NOTIFICATIONS">
                        <SettingToggle
                            icon="notifications"
                            iconColor="#F59E0B"
                            label="Message Notifications"
                            value={notifications}
                            onToggle={toggleNotifications}
                        />
                        <Divider />
                        <SettingRow icon="musical-note" iconColor="#A855F7" label="Message Tone" onPress={openMessageTone} />
                        <Divider />
                        <SettingRow icon="call" iconColor="#10B981" label="Call Ringtone" onPress={openCallRingtone} />
                    </Section>

                    {/* ── Privacy ── */}
                    <Section title="PRIVACY">
                        <SettingToggle
                            icon="checkmark-done"
                            iconColor="#3B82F6"
                            label="Read Receipts"
                            value={readReceipts}
                            onToggle={toggleReadReceipts}
                        />
                        <Divider />
                        <SettingToggle
                            icon="time"
                            iconColor={colors.primary}
                            label="Show Online Status"
                            value={onlineStatus}
                            onToggle={toggleOnlineStatus}
                        />
                        <Divider />
                        <SettingRow
                            icon="image"
                            iconColor="#06B6D4"
                            label="Profile Photo"
                            value={labelOf(PHOTO_OPTIONS, photoVisibility)}
                            onPress={() => setSheet({
                                title: "Who can see my profile photo",
                                options: PHOTO_OPTIONS,
                                value: photoVisibility,
                                onPick: changePhotoVisibility,
                            })}
                        />
                        <Divider />
                        <SettingRow
                            icon="ban"
                            iconColor={colors.danger}
                            label="Blocked Contacts"
                            value={blockedCount === null ? undefined : String(blockedCount)}
                            onPress={() => router.push("/screens/blockedContacts")}
                        />
                    </Section>

                    {/* ── Backup/Restore ── */}
                    <Section title="BACKUP & RESTORE DATA">
                        <SettingRow icon="cloud-upload" iconColor="#3B82F6" label="Backup & Restore" onPress={() => { router.navigate("/screens/backupScreen") }} />
                    </Section>

                    {/* ── Security ── */}
                    <Section title="SECURITY">
                        <SettingToggle
                            icon="finger-print"
                            iconColor={colors.primary}
                            label="Biometric Lock"
                            value={biometric}
                            onToggle={toggleBiometric}
                        />
                        <Divider />
                        <SettingRow
                            icon="shield-checkmark"
                            iconColor="#10B981"
                            label="Two-Step Verification"
                            value={twoStep ? "On" : "Off"}
                            onPress={() => router.push("/screens/twoStep")}
                        />
                    </Section>

                    {/* ── Appearance ── */}
                    <Section title="APPEARANCE">
                        <SettingRow
                            icon="moon"
                            iconColor={colors.primary}
                            label="Theme"
                            value={labelOf(THEME_OPTIONS, themeSetting)}
                            onPress={() => setSheet({
                                title: "Theme",
                                options: THEME_OPTIONS,
                                value: themeSetting,
                                note: "The app restarts to apply the change.",
                                onPick: (v) => changeAppearance(v as ThemeSetting, fontSizeSetting),
                            })}
                        />
                        <Divider />
                        <SettingRow
                            icon="text"
                            iconColor="#F59E0B"
                            label="Font Size"
                            value={labelOf(FONT_OPTIONS, fontSizeSetting)}
                            onPress={() => setSheet({
                                title: "Font size",
                                options: FONT_OPTIONS,
                                value: fontSizeSetting,
                                note: "The app restarts to apply the change.",
                                onPick: (v) => changeAppearance(themeSetting, v as FontSizeSetting),
                            })}
                        />
                    </Section>

                    {/* ── Storage ── */}
                    <Section title="STORAGE">
                        <SettingRow icon="trash-bin" iconColor="#10B981" label="Clear Cache" value={formatBytes(cacheBytes) ?? "0 MB"} onPress={askClearCache} />
                    </Section>

                    {/* ── Help ── */}
                    <Section title="HELP">
                        <SettingRow icon="help-circle" iconColor="#06B6D4" label="Help Center" />
                        <Divider />
                        <SettingRow icon="document-text" iconColor="#64748B" label="Terms of Service" />
                        <Divider />
                        <SettingRow icon="shield" iconColor="#64748B" label="Privacy Policy" />
                    </Section>

                    {/* ── Danger Zone ── */}
                    <Section>
                        <SettingRow
                            icon="log-out"
                            label="Logout"
                            showArrow={false}
                            danger
                            onPress={() => logout()}
                        />
                        <Divider />
                        <SettingRow
                            icon="trash"
                            label="Delete Account"
                            showArrow={false}
                            danger
                        />
                    </Section>

                    <Text style={SettingsStyle.version}>ChatApp v1.0.0</Text>
                </ScrollView>
            </View>

            <BottomSheet visible={!!sheet} onClose={() => setSheet(null)} sheetHeight={330}>
                <Text style={sheetStyles.title}>{sheet?.title}</Text>
                {sheet?.options.map((o) => {
                    const selected = o.value === sheet.value;
                    return (
                        <Pressable
                            key={o.value}
                            style={[sheetStyles.option, selected && sheetStyles.optionSelected]}
                            onPress={() => {
                                setSheet(null);
                                if (!selected) sheet.onPick(o.value);
                            }}
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={sheetStyles.optionLabel}>{o.label}</Text>
                                <Text style={sheetStyles.optionSub}>{o.sub}</Text>
                            </View>
                            <Ionicons
                                name={selected ? "radio-button-on" : "radio-button-off"}
                                size={22}
                                color={selected ? colors.primary : colors.textMuted}
                            />
                        </Pressable>
                    );
                })}
                {!!sheet?.note && <Text style={sheetStyles.note}>{sheet.note}</Text>}
            </BottomSheet>
        </SafeAreaView>
    );
}

const sheetStyles = StyleSheet.create({
    title: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 12 },
    option: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 },
    optionSelected: { backgroundColor: colors.primarySoft },
    optionLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
    optionSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    note: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: 12 },
});
