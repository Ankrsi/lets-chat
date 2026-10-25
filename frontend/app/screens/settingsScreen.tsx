import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    ScrollView,
    StatusBar,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SettingsStyle, styles } from "../styles";
import { colors } from "@/theme";
import { logout } from "@/utils/socket";

// ── Types ──────────────────────────────────────────────────────────────────
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

// ── Icon Box ───────────────────────────────────────────────────────────────
function IconBox({ name, color = colors.primary }: { name: IoniconsName; color?: string }) {
    return (
        <View style={[SettingsStyle.iconBox, { backgroundColor: color + "18" }]}>
            <Ionicons name={name} size={18} color={color} />
        </View>
    );
}

// ── Setting Row ────────────────────────────────────────────────────────────
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

// ── Setting Toggle ─────────────────────────────────────────────────────────
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

// ── Section ────────────────────────────────────────────────────────────────
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

// ── Main ───────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
    const router = useRouter();
    const [info, setInfo] = useState<any>({});
    const [notifications, setNotifications] = useState(true);
    const [readReceipts, setReadReceipts] = useState(true);
    const [lastSeen, setLastSeen] = useState(true);
    const [biometric, setBiometric] = useState(false);
    const [darkMode, setDarkMode] = useState(false);

    // Re-read on focus so edits made on the profile screen show up when coming back
    useFocusEffect(useCallback(() => {
        (async () => {
            const [phone, handle, first_name, last_name, about, profile] = (
                await AsyncStorage.multiGet(["username", "userHandle", "first_name", "last_name", "about", "profile"])
            ).map(([, v]) => v || "");
            setInfo({ phone, handle, first_name, last_name, about, profile });
        })();
    }, []));

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
            <View style={SettingsStyle.root}>
                <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

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
                            label="Push Notifications"
                            value={notifications}
                            onToggle={setNotifications}
                        />
                        <Divider />
                        <SettingRow icon="musical-note" iconColor="#A855F7" label="Message Tones" value="Default" />
                        <Divider />
                        <SettingRow icon="call" iconColor="#10B981" label="Call Ringtone" value="Default" />
                    </Section>

                    {/* ── Privacy ── */}
                    <Section title="PRIVACY">
                        <SettingToggle
                            icon="checkmark-done"
                            iconColor="#3B82F6"
                            label="Read Receipts"
                            value={readReceipts}
                            onToggle={setReadReceipts}
                        />
                        <Divider />
                        <SettingToggle
                            icon="time"
                            iconColor={colors.primary}
                            label="Last Seen"
                            value={lastSeen}
                            onToggle={setLastSeen}
                        />
                        <Divider />
                        <SettingRow icon="image" iconColor="#06B6D4" label="Profile Photo" value="Everyone" />
                        <Divider />
                        <SettingRow icon="ban" iconColor={colors.danger} label="Blocked Contacts" value="0" />
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
                            onToggle={setBiometric}
                        />
                        <Divider />
                        <SettingRow icon="shield-checkmark" iconColor="#10B981" label="Two-Step Verification" value="Off" />
                    </Section>

                    {/* ── Appearance ── */}
                    <Section title="APPEARANCE">
                        <SettingToggle
                            icon="moon"
                            iconColor={colors.primary}
                            label="Dark Mode"
                            value={darkMode}
                            onToggle={setDarkMode}
                        />
                        <Divider />
                        <SettingRow icon="image" iconColor="#06B6D4" label="Chat Wallpaper" />
                        <Divider />
                        <SettingRow icon="text" iconColor="#F59E0B" label="Font Size" value="Medium" />
                    </Section>

                    {/* ── Storage ── */}
                    <Section title="STORAGE & DATA">
                        <SettingRow icon="save" iconColor="#10B981" label="Manage Storage" value="1.2 GB" />
                        <Divider />
                        <SettingRow icon="wifi" iconColor="#3B82F6" label="Network Usage" />
                        <Divider />
                        <SettingRow icon="download" iconColor="#A855F7" label="Auto-Download Media" value="Wi-Fi" />
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
        </SafeAreaView>
    );
}
