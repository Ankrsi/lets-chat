import BrandMark from "@/app/components/BrandMark";
import CountryPicker, { deviceCountry } from "@/app/components/CountryPicker";
import { COUNTRIES } from "@/utils/countries";
import { CountryCode, parsePhoneNumberFromString } from "libphonenumber-js";
import metadata from "libphonenumber-js/metadata.min.json";
import { colors, statusBarStyle } from "@/theme";
import { AuthAPI, apiErrorMessage } from "@/utils/api";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { LoginStyles } from "../styles";

export default function LoginScreen() {
  const router = useRouter();
  const [country, setCountry] = useState<string>(() => deviceCountry());
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  // A pasted/typed full number ("+44 7911 123456") picks its country and keeps the local part
  const changePhone = (text: string) => {
    if (text.trim().startsWith("+")) {
      const parsed = parsePhoneNumberFromString(text.replace(/[\s()-]/g, ""));
      if (parsed) {
        // Codes shared by several countries (+1, +44, +7…): keep the selected one if it fits,
        // otherwise the code's main country (US, GB, RU…), not whichever region matched first
        const sharing: string[] = metadata.country_calling_codes[parsed.countryCallingCode] ?? [];
        setCountry(sharing.includes(country) ? country : sharing[0] ?? parsed.country ?? country);
        setPhone(parsed.nationalNumber);
        return;
      }
    }
    setPhone(text);
  };

  const sendOtp = async () => {
    const parsed = parsePhoneNumberFromString(phone.replace(/[\s()-]/g, ""), country as CountryCode);
    if (!parsed || !parsed.isValid()) {
      const name = COUNTRIES.find(([c]) => c === country)?.[1] ?? "your country";
      Alert.alert("Invalid phone number", `Enter a valid phone number for ${name}.`);
      return;
    }
    const normalized = parsed.number; // E.164, e.g. +919876543210

    setLoading(true);
    try {
      await AuthAPI.post("/auth/generate-otp", { phone: normalized });
      router.push({
        pathname: "/screens/verify",
        params: { phone: normalized },
      });
    } catch (err: any) {
      Alert.alert("Couldn't send code", apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle={statusBarStyle} backgroundColor={colors.surface} />
      <ScrollView
        contentContainerStyle={LoginStyles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={LoginStyles.header}>
          <BrandMark />
          <Text style={LoginStyles.headerTitle}>Welcome</Text>
          <Text style={LoginStyles.headerSub}>Log in or create an account</Text>
          <Text style={LoginStyles.headerDesc}>{"Enter your phone number. New here? We'll set up your account after you verify it."}</Text>
        </View>

        {/* ── Card ── */}
        <View style={LoginStyles.card}>
          <View style={LoginStyles.formBlock}>
            <Text style={LoginStyles.inputLabel}>Phone number</Text>
            <View style={LoginStyles.inputWrap}>
              <CountryPicker value={country} onChange={setCountry} />
              <TextInput
                placeholder="Phone number"
                placeholderTextColor={colors.textMuted}
                value={phone}
                onChangeText={changePhone}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                style={LoginStyles.input}
              />
            </View>
            <Text style={LoginStyles.hint}>
              {"We'll send a one-time code to this number"}
            </Text>

            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
            ) : (
              <TouchableOpacity style={LoginStyles.btn} onPress={sendOtp} activeOpacity={0.85}>
                <Text style={LoginStyles.btnText}>Send OTP</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text style={LoginStyles.footer}>
          {'By continuing you agree to our '}
          <Text style={LoginStyles.footerLink}>Terms of Service</Text>
          {' and '}
          <Text style={LoginStyles.footerLink}>Privacy Policy</Text>
          {'.'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
