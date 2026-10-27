import { colors, gradients, shadow } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet } from "react-native";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

export default function BrandMark({ icon = "chatbubbles", size = 64 }: { icon?: IoniconsName; size?: number }) {
  return (
    <LinearGradient
      colors={gradients.primary}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.mark, { width: size, height: size, borderRadius: size * 0.32 }]}
    >
      <Ionicons name={icon} size={size * 0.5} color={colors.textOnPrimary} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: "center", justifyContent: "center", marginBottom: 22, ...shadow(3), shadowColor: colors.primary },
});
