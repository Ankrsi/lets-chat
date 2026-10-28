import BrandMark from "@/app/components/BrandMark";
import { colors } from "@/theme";
import { isAppLockOn, unlockWithBiometrics } from "@/utils/appLock";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// Locks again after this long in the background (short trips, like the photo picker, don't)
const LOCK_AFTER_MS = 30 * 1000;

export default function AppLock() {
  const [locked, setLocked] = useState(isAppLockOn);
  const authenticating = useRef(false);
  const backgroundAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    try {
      if (await unlockWithBiometrics()) setLocked(false);
    } catch (err) {
      console.info("unlock failed", err);
    } finally {
      authenticating.current = false;
    }
  }, []);

  // On launch
  useEffect(() => {
    if (locked) unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coming back to the app
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      // The fingerprint prompt itself sends the app to the background on Android
      if (authenticating.current) return;
      if (state === "background") {
        backgroundAt.current = Date.now();
      } else if (state === "active" && backgroundAt.current !== null) {
        const away = Date.now() - backgroundAt.current;
        backgroundAt.current = null;
        if (isAppLockOn() && away >= LOCK_AFTER_MS) {
          setLocked(true);
          unlock();
        }
      }
    });
    return () => sub.remove();
  }, [unlock]);

  if (!locked) return null;
  // A Modal, so it covers other open modals too (photo previews, sheets). Back can't close it.
  return (
    <Modal visible animationType="none" statusBarTranslucent onRequestClose={() => undefined}>
    <View style={styles.root}>
      <BrandMark size={72} />
      <Text style={styles.title}>Chat App is locked</Text>
      <Text style={styles.sub}>Use your fingerprint, face or phone PIN to open it.</Text>
      <TouchableOpacity style={styles.btn} onPress={unlock} activeOpacity={0.85}>
        <Ionicons name="finger-print" size={20} color={colors.textOnPrimary} />
        <Text style={styles.btnText}>Unlock</Text>
      </TouchableOpacity>
    </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  sub: { fontSize: 14, color: colors.textSecondary, textAlign: "center", marginTop: 8 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 28,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
  },
  btnText: { color: colors.textOnPrimary, fontSize: 15, fontWeight: "700" },
});
