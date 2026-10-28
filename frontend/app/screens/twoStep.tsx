import BrandMark from "@/app/components/BrandMark";
import { SettingsStyle } from "@/app/styles";
import { colors, statusBarStyle } from "@/theme";
import { AuthAPI, apiErrorMessage } from "@/utils/api";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Step = "overview" | "current" | "new" | "confirm" | "disable";

const TITLES: Record<Exclude<Step, "overview">, { title: string; sub: string }> = {
  current: { title: "Enter current code", sub: "Enter your current 6-digit code to change it." },
  new: { title: "Create a 6-digit code", sub: "You'll be asked for it when you log in on a new phone." },
  confirm: { title: "Confirm your code", sub: "Enter the same 6-digit code again." },
  disable: { title: "Turn off two-step verification", sub: "Enter your 6-digit code to turn it off." },
};

// Six boxes over one hidden input
function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const input = useRef<TextInput>(null);
  return (
    <Pressable style={styles.codeRow} onPress={() => input.current?.focus()}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={[styles.codeBox, i === value.length && styles.codeBoxActive]}>
          {i < value.length && <View style={styles.codeDot} />}
        </View>
      ))}
      <TextInput
        ref={input}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        caretHidden
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

export default function TwoStepScreen() {
  const router = useRouter();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>("overview");
  const [code, setCode] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    AuthAPI.get("/profile/me")
      .then((res) => setEnabled(!!res.data.user.twoStepEnabled))
      .catch(() => AsyncStorage.getItem("twoStepEnabled").then((v) => setEnabled(v === "1")));
  }, []);

  const go = (next: Step) => {
    setCode("");
    setStep(next);
  };

  const saveEnabled = async (on: boolean) => {
    setEnabled(on);
    await AsyncStorage.setItem("twoStepEnabled", on ? "1" : "0");
  };

  const submit = async () => {
    if (code.length !== 6) return;
    if (step === "current") {
      setCurrentPin(code);
      return go("new");
    }
    if (step === "new") {
      setNewPin(code);
      return go("confirm");
    }
    if (step === "confirm" && code !== newPin) {
      Alert.alert("Codes don't match", "Enter the new code again.");
      return go("new");
    }

    setBusy(true);
    try {
      if (step === "disable") {
        await AuthAPI.post("/profile/two-step/disable", { pin: code });
        await saveEnabled(false);
        Alert.alert("Two-step verification is off");
      } else {
        await AuthAPI.put("/profile/two-step", { pin: newPin, ...(enabled && { currentPin }) });
        Alert.alert(enabled ? "Code changed" : "Two-step verification is on", "Don't forget this code. You'll need it to log in on a new phone.");
        await saveEnabled(true);
      }
      go("overview");
    } catch (err) {
      Alert.alert("Couldn't save", apiErrorMessage(err));
      // A wrong current code: start that flow again
      go(step === "disable" ? "disable" : enabled ? "current" : "new");
    } finally {
      setBusy(false);
    }
  };

  const back = () => (step === "overview" ? router.back() : go("overview"));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={colors.surface} />
      <View style={SettingsStyle.header}>
        <TouchableOpacity style={SettingsStyle.backBtn} onPress={back}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={SettingsStyle.headerTitle}>Two-Step Verification</Text>
      </View>

      <View style={styles.body}>
        {enabled === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : step === "overview" ? (
          <>
            <BrandMark icon="shield-checkmark" />
            <Text style={styles.title}>{enabled ? "Two-step verification is on" : "Add extra security"}</Text>
            <Text style={styles.sub}>
              {enabled
                ? "Your 6-digit code is asked when you log in on a new phone, after the SMS code."
                : "Set a 6-digit code that's asked after the SMS code when you log in on a new phone. Someone with your SIM still can't get in without it."}
            </Text>
            {enabled ? (
              <>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => go("current")}>
                  <Text style={styles.primaryText}>Change code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => go("disable")}>
                  <Text style={[styles.ghostText, { color: colors.danger }]}>Turn off</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.primaryBtn} onPress={() => go("new")}>
                <Text style={styles.primaryText}>Turn on</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <Text style={styles.title}>{TITLES[step].title}</Text>
            <Text style={styles.sub}>{TITLES[step].sub}</Text>
            <CodeInput key={step} value={code} onChange={setCode} />
            <TouchableOpacity
              style={[styles.primaryBtn, (code.length !== 6 || busy) && { opacity: 0.5 }]}
              onPress={submit}
              disabled={code.length !== 6 || busy}
            >
              {busy
                ? <ActivityIndicator color={colors.textOnPrimary} />
                : <Text style={styles.primaryText}>{step === "confirm" ? "Save" : step === "disable" ? "Turn off" : "Next"}</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: colors.background, alignItems: "center", paddingHorizontal: 28, paddingTop: 36 },
  title: { fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" },
  sub: { fontSize: 14, color: colors.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 20 },
  codeRow: { flexDirection: "row", gap: 10, marginTop: 32 },
  codeBox: {
    width: 44,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  codeBoxActive: { borderColor: colors.primary },
  codeDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.text },
  hiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },
  primaryBtn: {
    marginTop: 32,
    alignSelf: "stretch",
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: colors.textOnPrimary, fontSize: 16, fontWeight: "700" },
  ghostBtn: { marginTop: 12, paddingVertical: 12, alignSelf: "stretch", alignItems: "center" },
  ghostText: { fontSize: 15, fontWeight: "600" },
});
