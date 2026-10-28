import { colors, gradients, shadow } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet } from "react-native";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

// No icon: the app logo
export default function BrandMark({ icon, size = 64 }: { icon?: IoniconsName; size?: number }) {
  return (
    <LinearGradient
      colors={gradients.primary}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.mark, { width: size, height: size, borderRadius: size * 0.32 }]}
    >
      {icon
        ? <Ionicons name={icon} size={size * 0.5} color={colors.textOnPrimary} />
        : <Image source={require("@/assets/images/brand-mark.png")} style={{ width: size * 0.62, height: size * 0.62 }} />}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: "center", justifyContent: "center", marginBottom: 22, ...shadow(3), shadowColor: colors.primary },
});
