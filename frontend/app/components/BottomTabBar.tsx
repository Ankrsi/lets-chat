import { colors, shadow } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Tab = "reels" | "chats" | "status";
type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: { key: Tab; label: string; route: string; icon: IoniconsName; activeIcon: IoniconsName }[] = [
  { key: "reels", label: "Reels", route: "/screens/reels/reelsScreen", icon: "play-circle-outline", activeIcon: "play-circle" },
  { key: "chats", label: "Chats", route: "/screens/chat", icon: "chatbubbles-outline", activeIcon: "chatbubbles" },
  { key: "status", label: "Status", route: "/screens/statusScreens/statusScreen", icon: "aperture-outline", activeIcon: "aperture" },
];

/** Main navigation. navigate() returns to a tab already in the stack instead of stacking a copy. */
export default function BottomTabBar({ active }: { active: Tab }) {
  const router = useRouter();
  // The bar pads itself above the system navigation area, so it's the same on every tab.
  // Screens using it must not add their own bottom safe-area edge.
  const { bottom } = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: 8 + bottom }]}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.item}
            onPress={() => !isActive && router.navigate(tab.route as any)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <View style={[styles.pill, isActive && styles.pillActive]}>
              <Ionicons name={isActive ? tab.activeIcon : tab.icon} size={22} color={isActive ? colors.primary : colors.textMuted} />
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...shadow(2),
  },
  item: { flex: 1, alignItems: "center", gap: 3 },
  pill: { width: 60, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  pillActive: { backgroundColor: colors.primarySoft },
  label: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  labelActive: { color: colors.primary, fontWeight: "700" },
});
