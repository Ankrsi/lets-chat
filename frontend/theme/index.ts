import { Platform, ViewStyle } from "react-native";

// App-wide design tokens. Screens should use these instead of hard-coded colors.
export const colors = {
  // Brand
  primary: "#6366F1", // indigo
  primaryDark: "#4F46E5",
  primaryAlt: "#8B5CF6", // violet, second gradient stop
  primarySoft: "#EEF2FF", // tinted backgrounds: selected rows, active chips
  primaryMuted: "#C7D2FE",

  // Surfaces
  background: "#F6F7FB", // screen background behind cards
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9", // inputs, received bubbles, chips
  border: "#E2E8F0",
  divider: "#EEF1F6",

  // Text
  text: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  textOnPrimary: "#FFFFFF",

  // Status
  success: "#10B981",
  danger: "#EF4444",
  dangerSoft: "#FEF2F2",
  warning: "#F59E0B",
  online: "#22C55E",
  readTick: "#6366F1",

  // Chat bubbles (dark text on both, so every message element stays readable)
  bubbleMine: "#E0E7FF",
  bubbleTheirs: "#FFFFFF",

  // Media screens (reels, viewers)
  black: "#000000",
  overlay: "rgba(15,23,42,0.45)",
};

// Gradient pairs for expo-linear-gradient
export const gradients = {
  primary: [colors.primary, colors.primaryAlt] as const,
};

export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const font = {
  title: 26,
  h1: 22,
  h2: 18,
  body: 15,
  small: 13,
  tiny: 11,
};

type ShadowStyle = Pick<ViewStyle, "shadowColor" | "shadowOffset" | "shadowOpacity" | "shadowRadius" | "elevation">;

/** Soft, low-contrast elevation for cards and floating elements (usable on View and Text styles). */
export const shadow = (level: 1 | 2 | 3 = 1): ShadowStyle => {
  const map = { 1: [2, 8, 0.06, 2], 2: [6, 16, 0.08, 5], 3: [10, 24, 0.12, 10] } as const;
  const [y, r, o, e] = map[level];
  return Platform.OS === "ios"
    ? { shadowColor: "#1E1B4B", shadowOffset: { width: 0, height: y }, shadowOpacity: o, shadowRadius: r }
    : { elevation: e, shadowColor: "#1E1B4B" };
};

export const theme = { colors, gradients, radius, spacing, font, shadow };
export default theme;
