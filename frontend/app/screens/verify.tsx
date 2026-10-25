import { Ionicons } from "@expo/vector-icons";
import BrandMark from "@/app/components/BrandMark";
import { colors } from "@/theme";
import { AuthAPI, apiErrorMessage } from '@/utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Platform } from 'react-native';
import NewDeviceLoginModal from '../components/NewDeviceLoginModal';
import { VerifyStyles } from '../styles';
import { finishLogin, getDeviceId, saveUser } from '@/utils/session';

export default function VerifyScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [newLogin, setNewLogin] = useState(false);

  const verifyOtp = async (forceLogin = false) => {
    if (!/^\d{6}$/.test(otp)) {
      Alert.alert("Invalid OTP", "Enter the 6-digit code you received.");
      return;
    }
    setNewLogin(false);
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      await AsyncStorage.setItem("deviceId", deviceId);
      const fcmToken = await AsyncStorage.getItem("fcmToken");
      const voipToken = await AsyncStorage.getItem("voipToken");

      const res = await AuthAPI.post("/auth/verify-otp", {
        phone,
        otp,
        deviceId,
        forceLogin,
        device_type: Platform.OS === "ios" ? "ios" : "android",
        appName: "SP_MAIN",
        ...(fcmToken && { fcm_token: fcmToken }),
        ...(voipToken && { voip_token: voipToken }),
      });

      const { accessToken, refreshToken, isNewUser, user } = res.data;
      await AsyncStorage.setItem("token", accessToken);
      await AsyncStorage.setItem("refreshToken", refreshToken);
      await saveUser(user);

      if (isNewUser) {
        // Account created: pick a username before entering the app
        if (router.canDismiss()) router.dismissAll(); // nothing to dismiss when already at the first screen
        router.replace("/screens/register");
        return;
      }
      await finishLogin(router);
    } catch (err: any) {
      if (err.status === 409) {
        setNewLogin(true);
        return;
      }
      Alert.alert("Verification failed", apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const resend = () => {
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* ── Header ── */}
      <View style={VerifyStyles.header}>
        <BrandMark icon="shield-checkmark" />
        <Text style={VerifyStyles.headerTitle}>Verify</Text>
        <Text style={VerifyStyles.headerSub}>
          Code sent to {' '}
          <Text style={VerifyStyles.headerHighlight}>{phone}</Text>
        </Text>
        <Text style={VerifyStyles.headerDesc}>
          Enter the 6-digit code we sent you.{'\n'}It expires in 10 minutes.
        </Text>
        <View style={VerifyStyles.warningBadge}>
          <Ionicons name="lock-closed" size={12} color={colors.danger} />
          <Text style={VerifyStyles.warningText}>
            Never share your OTP with anyone
          </Text>
        </View>
      </View>

      {/* ── Card ── */}
      <View style={VerifyStyles.card}>
        <Text style={VerifyStyles.inputLabel}>Enter OTP</Text>

        <View style={VerifyStyles.inputWrap}>
          <Ionicons name="keypad-outline" size={20} color={colors.textMuted} style={VerifyStyles.inputIcon} />
          <TextInput
            value={otp}
            onChangeText={(v) => setOtp(v.replace(/\D/g, ""))}
            keyboardType="number-pad"
            placeholder="••••••"
            placeholderTextColor={colors.textMuted}
            style={VerifyStyles.input}
            maxLength={6}
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
          />
        </View>

        <Text style={VerifyStyles.hint}>Enter the one-time code we sent you</Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 28 }} />
        ) : (
          <>
            <TouchableOpacity style={VerifyStyles.btnPrimary} onPress={() => verifyOtp(false)} activeOpacity={0.85}>
              <Text style={VerifyStyles.btnPrimaryText}>Verify OTP</Text>
            </TouchableOpacity>

            <TouchableOpacity style={VerifyStyles.btnGhost} onPress={resend} activeOpacity={0.7}>
              <Text style={VerifyStyles.btnGhostText}>Resend / Change Number</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <NewDeviceLoginModal
        visible={newLogin}
        onVerify={() => verifyOtp(true)}
        onCancel={() => setNewLogin(false)}
      />
    </KeyboardAvoidingView>
  );
}
