import { colors, font, radius } from "@/theme";
import { COUNTRIES } from "@/utils/countries";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const flagOf = (iso: string) =>
  String.fromCodePoint(...iso.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

export const dialCodeOf = (iso: string) => COUNTRIES.find(([c]) => c === iso)?.[2] ?? "";

export const deviceCountry = (fallback = "IN") => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
    const region = locale.split(/[-_]/).find((p) => /^[A-Z]{2}$/.test(p));
    if (region && COUNTRIES.some(([c]) => c === region)) return region;
  } catch {
    // no Intl locale: use the fallback
  }
  return fallback;
};

interface Props {
  value: string; // ISO code, e.g. "IN"
  onChange: (iso: string) => void;
}

export default function CountryPicker({ value, onChange }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, "");
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(([iso, name, dial]) =>
      name.toLowerCase().includes(q) || iso.toLowerCase() === q || dial.startsWith(q));
  }, [query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} activeOpacity={0.7} accessibilityLabel="Choose country code">
        <Text style={styles.flag}>{flagOf(value)}</Text>
        <Text style={styles.dial}>+{dialCodeOf(value)}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={close} statusBarTranslucent>
        <View style={[styles.sheet, { paddingTop: insets.top + 8 }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={close} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Choose country</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search country or code"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoFocus
              autoCorrect={false}
            />
          </View>

          <FlatList
            data={list}
            keyExtractor={([iso]) => iso}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            renderItem={({ item: [iso, name, dial] }) => (
              <Pressable
                style={({ pressed }) => [styles.row, iso === value && styles.rowActive, pressed && { backgroundColor: colors.surfaceAlt }]}
                onPress={() => { onChange(iso); close(); }}
              >
                <Text style={styles.rowFlag}>{flagOf(iso)}</Text>
                <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
                <Text style={styles.rowDial}>+{dial}</Text>
                {iso === value && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.empty}>No matching country</Text>}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 10,
    marginRight: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    alignSelf: "stretch",
  },
  flag: { fontSize: 20 },
  dial: { fontSize: font.body, fontWeight: "600", color: colors.text },

  sheet: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  title: { fontSize: font.h2, fontWeight: "700", color: colors.text },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  searchInput: { flex: 1, fontSize: font.body, color: colors.text },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  rowActive: { backgroundColor: colors.primarySoft },
  rowFlag: { fontSize: 22 },
  rowName: { flex: 1, fontSize: font.body, color: colors.text },
  rowDial: { fontSize: font.body, color: colors.textSecondary, fontWeight: "600" },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 40, fontSize: font.body },
});
