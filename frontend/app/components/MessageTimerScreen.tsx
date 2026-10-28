import { colors, font, radius, shadow, statusBarStyle } from "@/theme";
import { CHATAPI, apiErrorMessage } from "@/utils/api";
import { setGlobalDbTick } from "@/utils/globalRefs";
import { useDbUpdate } from "@/contexts/DbUpdateContext";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

export interface TimerOption {
    label: string;
    value: string;
}

interface Props {
    title: string;
    icon: React.ComponentProps<typeof Ionicons>["name"];
    heading: string;
    description: string;
    options: TimerOption[];
    load: (id: string) => Promise<string | null | undefined>;
    save: (id: string, value: string) => Promise<unknown>;
    endpoint: string;
}

const OFF = "0s";

export default function MessageTimerScreen({ title, icon, heading, description, options, load, save, endpoint }: Props) {
    const { dbTick } = useDbUpdate();
    const { id } = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const [selected, setSelected] = useState<string>(OFF);
    const [saving, setSaving] = useState<string | null>(null);
    const savingRef = useRef(false);

    useEffect(() => {
        (async () => {
            const value = await load(id as string);
            if (savingRef.current) return;
            setSelected(!value || value === "off" ? OFF : value);
        })();
    }, [id, dbTick, load]);

    const handleSelect = async (value: string) => {
        if (value === selected || savingRef.current) return;
        const previous = selected;
        savingRef.current = true;
        setSelected(value);
        setSaving(value);
        try {
            const res = await CHATAPI.post(endpoint, { conversationId: id, duration: value, timestamp: new Date().toISOString() });
            if (res?.success === false) throw new Error(res?.message || "Couldn't update the timer.");
            await save(id as string, value);
            setGlobalDbTick();
        } catch (err) {
            setSelected(previous);
            Alert.alert("Couldn't update", apiErrorMessage(err));
        } finally {
            savingRef.current = false;
            setSaving(null);
        }
    };

    const isOn = selected !== OFF;
    const current = options.find((o) => o.value === selected)?.label;

    return (
        <SafeAreaView style={s.container} edges={["top", "left", "right"]}>
            <StatusBar barStyle={statusBarStyle} backgroundColor={colors.surface} />

            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.headerBtn} accessibilityLabel="Back">
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
                <View style={s.headerBtn} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
                <View style={s.hero}>
                    <View style={[s.iconRing, isOn && s.iconRingOn]}>
                        <View style={[s.iconCircle, isOn && s.iconCircleOn]}>
                            <Ionicons name={icon} size={40} color={isOn ? colors.textOnPrimary : colors.primary} />
                        </View>
                    </View>
                    <Text style={s.heading}>{heading}</Text>
                    <Text style={s.subtext}>{description}</Text>
                    <View style={[s.statusPill, isOn && s.statusPillOn]}>
                        <View style={[s.statusDot, isOn && { backgroundColor: colors.success }]} />
                        <Text style={[s.statusText, isOn && { color: colors.primaryDark }]}>
                            {isOn ? `On · ${current ?? selected}` : "Off"}
                        </Text>
                    </View>
                </View>

                <Text style={s.sectionTitle}>Message timer</Text>
                <View style={s.card}>
                    {options.map((opt, index) => {
                        const active = selected === opt.value;
                        return (
                            <TouchableOpacity
                                key={opt.value}
                                style={[s.optionRow, index === options.length - 1 && { borderBottomWidth: 0 }, active && s.optionRowActive]}
                                onPress={() => handleSelect(opt.value)}
                                activeOpacity={0.7}
                                disabled={!!saving}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: active }}
                            >
                                <Text style={[s.optionLabel, active && s.optionLabelActive]}>{opt.label}</Text>
                                {saving === opt.value
                                    ? <ActivityIndicator size="small" color={colors.primary} />
                                    : (
                                        <View style={[s.radioOuter, active && s.radioOuterActive]}>
                                            {active && <Ionicons name="checkmark" size={14} color={colors.textOnPrimary} />}
                                        </View>
                                    )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View style={s.note}>
                    <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
                    <Text style={s.noteText}>Only new messages are affected. Anyone in the chat can change this setting.</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

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
    headerTitle: { flex: 1, textAlign: "center", fontSize: font.h2, fontWeight: "700", color: colors.text },

    hero: {
        alignItems: "center",
        backgroundColor: colors.surface,
        paddingTop: 28,
        paddingBottom: 22,
        paddingHorizontal: 24,
        borderBottomLeftRadius: radius.xl,
        borderBottomRightRadius: radius.xl,
        ...shadow(1),
    },
    iconRing: { padding: 8, borderRadius: 60, backgroundColor: colors.primarySoft },
    iconRingOn: { backgroundColor: colors.primaryMuted },
    iconCircle: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
    iconCircleOn: { backgroundColor: colors.primary },
    heading: { fontSize: font.h2, fontWeight: "700", color: colors.text, textAlign: "center", marginTop: 18 },
    subtext: { fontSize: font.small + 1, color: colors.textSecondary, textAlign: "center", lineHeight: 20, marginTop: 8 },
    statusPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 16,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceAlt,
    },
    statusPillOn: { backgroundColor: colors.primarySoft },
    statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted },
    statusText: { fontSize: font.small, fontWeight: "600", color: colors.textSecondary },

    sectionTitle: {
        fontSize: font.small - 1,
        fontWeight: "700",
        color: colors.textSecondary,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginTop: 22,
        marginBottom: 8,
        marginHorizontal: 20,
    },
    card: { marginHorizontal: 16, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", ...shadow(1) },
    optionRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 15,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.divider,
    },
    optionRowActive: { backgroundColor: colors.primarySoft },
    optionLabel: { fontSize: font.body, color: colors.text },
    optionLabelActive: { fontWeight: "700", color: colors.primaryDark },
    radioOuter: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    radioOuterActive: { borderColor: colors.primary, backgroundColor: colors.primary },

    note: { flexDirection: "row", gap: 8, marginHorizontal: 20, marginTop: 14 },
    noteText: { flex: 1, fontSize: font.small, color: colors.textMuted, lineHeight: 18 },
});
