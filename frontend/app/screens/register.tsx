import BrandMark from "@/app/components/BrandMark";
import { saveTokens } from "@/utils/tokens";
import { colors, statusBarStyle } from "@/theme";
import { AuthAPI, apiErrorMessage } from "@/utils/api";
import { finishLogin, saveUser } from "@/utils/session";
import { normalizeUsername, usernameStatusText, useUsernameStatus } from "@/utils/username";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LoginStyles, ProfileStyles } from "../styles";

export default function RegisterScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const status = useUsernameStatus(username);
  const statusText = usernameStatusText(status);

  useEffect(() => {
    AsyncStorage.getItem("username").then((p) => setPhone(p ?? ""));
  }, []);

  // Once the keyboard is up (and the view has shrunk), bring the form fields and button into view
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, []);

  const canSubmit = status.state === "available" && firstName.trim().length > 0 && !loading;

  const register = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await AuthAPI.post("/auth/register", {
        username: normalizeUsername(username),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      // The new access token includes the username
      await saveTokens(res.data.accessToken);
      await saveUser(res.data.user);
      await finishLogin(router);
    } catch (err: any) {
      Alert.alert("Couldn't create account", apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      // Android runs edge-to-edge, so adjustResize no longer shrinks the window: shrink it here
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle={statusBarStyle} backgroundColor={colors.surface} />
      <ScrollView
        ref={scrollRef}
        style={{ backgroundColor: colors.surface }}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── (fixed fractions from LoginStyles would clip the longer form) */}
        <View style={[LoginStyles.header, { flex: 0 }]}>
          <BrandMark icon="person-add" />
          <Text style={LoginStyles.headerTitle}>Create your profile</Text>
          <Text style={LoginStyles.headerSub}>{phone ? `+${phone} verified` : "Phone verified"}</Text>
          <Text style={LoginStyles.headerDesc}>Pick a username so people can find you. You can change it later in Settings.</Text>
        </View>

        {/* ── Card ── */}
        <View style={[LoginStyles.card, { flex: 0 }]}>
          <View style={LoginStyles.formBlock}>
            <Text style={LoginStyles.inputLabel}>Username</Text>
            <View style={LoginStyles.inputWrap}>
              <Text style={ProfileStyles.usernameAt}>@</Text>
              <TextInput
                placeholder="your.name"
                placeholderTextColor={colors.textMuted}
                value={username}
                onChangeText={(v) => setUsername(v.replace(/\s/g, ""))}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={21}
                style={LoginStyles.input}
              />
            </View>
            {statusText ? (
              <Text style={[ProfileStyles.status, statusText.ok ? ProfileStyles.statusOk : ProfileStyles.statusBad]}>
                {statusText.text}
              </Text>
            ) : (
              <Text style={LoginStyles.hint}>{"3–20 characters: letters, numbers, '.' and '_'"}</Text>
            )}

            <Text style={[LoginStyles.inputLabel, { marginTop: 16 }]}>First name</Text>
            <View style={LoginStyles.inputWrap}>
              <TextInput
                placeholder="First name"
                placeholderTextColor={colors.textMuted}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                textContentType="givenName"
                maxLength={50}
                style={LoginStyles.input}
              />
            </View>

            <Text style={[LoginStyles.inputLabel, { marginTop: 16 }]}>Last name (optional)</Text>
            <View style={LoginStyles.inputWrap}>
              <TextInput
                placeholder="Last name"
                placeholderTextColor={colors.textMuted}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                textContentType="familyName"
                maxLength={50}
                style={LoginStyles.input}
              />
            </View>

            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
            ) : (
              <TouchableOpacity
                style={[LoginStyles.btn, !canSubmit && ProfileStyles.btnDisabled]}
                onPress={register}
                disabled={!canSubmit}
                activeOpacity={0.85}
              >
                <Text style={LoginStyles.btnText}>Continue</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
