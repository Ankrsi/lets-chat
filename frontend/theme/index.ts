import Storage from "expo-sqlite/kv-store";
import { Appearance, Platform, StyleSheet, ViewStyle } from "react-native";

// Appearance settings are read synchronously here, before any screen builds its styles,
// because styles are created once from these values. Changing them restarts the app.
export type ThemeSetting = "system" | "light" | "dark";
export type FontSizeSetting = "small" | "medium" | "large";

const THEME_KEY = "appearance.theme";
const FONT_KEY = "appearance.fontSize";

const readSetting = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const value = Storage.getItemSync(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
};

export const themeSetting = readSetting<ThemeSetting>(THEME_KEY, ["system", "light", "dark"], "system");
export const fontSizeSetting = readSetting<FontSizeSetting>(FONT_KEY, ["small", "medium", "large"], "medium");

// Native parts (alerts, pickers, keyboard) follow the app's choice too
if (themeSetting !== "system") Appearance.setColorScheme(themeSetting);
export const isDark = themeSetting === "dark" || (themeSetting === "system" && Appearance.getColorScheme() === "dark");

export const saveAppearance = (theme: ThemeSetting, fontSize: FontSizeSetting) => {
  Storage.setItemSync(THEME_KEY, theme);
  Storage.setItemSync(FONT_KEY, fontSize);
};

// App-wide design tokens. Screens should use these instead of hard-coded colors.
const light = {
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
  warningSoft: "#FFF8E1",
  online: "#22C55E",
  readTick: "#6366F1",

  // Chat bubbles
  bubbleMine: "#E0E7FF",
  bubbleTheirs: "#FFFFFF",

  // Media screens (reels, viewers)
  black: "#000000",
  overlay: "rgba(15,23,42,0.45)",
};

const dark: typeof light = {
  primary: "#6366F1",
  primaryDark: "#4F46E5",
  primaryAlt: "#8B5CF6",
  primarySoft: "#24264A",
  primaryMuted: "#A5B4FC",

  background: "#0B1020",
  surface: "#151A2D",
  surfaceAlt: "#1F2539",
  border: "#2A3148",
  divider: "#222940",

  text: "#F1F5F9",
  textSecondary: "#A3AEC2",
  textMuted: "#6B7894",
  textOnPrimary: "#FFFFFF",

  success: "#10B981",
  danger: "#F87171",
  dangerSoft: "#3A1D24",
  warning: "#F59E0B",
  warningSoft: "#3A2E12",
  online: "#22C55E",
  readTick: "#A5B4FC",

  bubbleMine: "#3730A3",
  bubbleTheirs: "#1F2539",

  black: "#000000",
  overlay: "rgba(0,0,0,0.55)",
};

export const colors = isDark ? dark : light;

// Status bar text that stays readable on colors.surface / colors.background
export const statusBarStyle = isDark ? "light-content" : "dark-content";

// Gradient pairs for expo-linear-gradient
export const gradients = {
  primary: [colors.primary, colors.primaryAlt] as const,
};

export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Font size setting: every fontSize / lineHeight in StyleSheet.create is scaled by this
export const fontScale = { small: 0.9, medium: 1, large: 1.15 }[fontSizeSetting];

const scaled = (n: number) => Math.round(n * fontScale);

export const font = {
  title: scaled(26),
  h1: scaled(22),
  h2: scaled(18),
  body: scaled(15),
  small: scaled(13),
  tiny: scaled(11),
};

if (fontScale !== 1 && !(StyleSheet.create as any).__scaled) {
  const create = StyleSheet.create;
  const scaleStyles = (styles: Record<string, any>) => {
    for (const style of Object.values(styles)) {
      if (!style || typeof style !== "object") continue;
      if (typeof style.fontSize === "number") style.fontSize = scaled(style.fontSize);
      if (typeof style.lineHeight === "number") style.lineHeight = scaled(style.lineHeight);
    }
    return styles;
  };
  const patched = ((styles: any) => create(scaleStyles(styles))) as typeof StyleSheet.create;
  (patched as any).__scaled = true;
  StyleSheet.create = patched;
}

type ShadowStyle = Pick<ViewStyle, "shadowColor" | "shadowOffset" | "shadowOpacity" | "shadowRadius" | "elevation">;

export const shadow = (level: 1 | 2 | 3 = 1): ShadowStyle => {
  const map = { 1: [2, 8, 0.06, 2], 2: [6, 16, 0.08, 5], 3: [10, 24, 0.12, 10] } as const;
  const [y, r, o, e] = map[level];
  const shadowColor = isDark ? "#000000" : "#1E1B4B";
  return Platform.OS === "ios"
    ? { shadowColor, shadowOffset: { width: 0, height: y }, shadowOpacity: o, shadowRadius: r }
    : { elevation: e, shadowColor };
};

export const theme = { colors, gradients, radius, spacing, font, shadow };
export default theme;
