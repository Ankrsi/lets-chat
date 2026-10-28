import 'react-native-get-random-values';
import { getAccessToken } from "@/utils/tokens";
// First: reads the appearance settings before any styles are built
import '@/theme';
import AppLock from "@/app/components/AppLock";
import { DbUpdateProvider } from "@/contexts/DbUpdateContext";
import { FriendContactProvider } from "@/contexts/FriendContactContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { SocketProvider } from "@/contexts/SocketContext";
import { initDB } from "@/db/initDB";
import { requestAllPermissions } from '@/utils/permissions';
import { AuthAPI } from '@/utils/api';
import { initVideoCache } from '@/utils/videoCache';
import { colors } from '@/theme';
import notifee from '@notifee/react-native';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getMessaging, getToken } from '@react-native-firebase/messaging';
import { Image } from 'expo-image';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useNavigationContainerRef } from "expo-router";
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from "react";
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

SplashScreen.preventAutoHideAsync();

const { width } = Dimensions.get('window');

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const logoScale = useSharedValue(0);
  const logoOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0);
  const ringOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const textY = useSharedValue(20);
  const shimmerX = useSharedValue(-width);

  useEffect(() => {
    // Ring pulse
    ringScale.value = withTiming(2.5, { duration: 900, easing: Easing.out(Easing.exp) });
    ringOpacity.value = withSequence(
      withTiming(0.4, { duration: 400 }),
      withDelay(300, withTiming(0, { duration: 500 }))
    );

    // Logo entrance
    logoScale.value = withDelay(
      150,
      withSpring(1, { damping: 12, stiffness: 120 })
    );
    logoOpacity.value = withDelay(
      150,
      withTiming(1, { duration: 400 })
    );

    // Shimmer sweep
    shimmerX.value = withDelay(
      600,
      withTiming(width * 2, { duration: 900, easing: Easing.inOut(Easing.quad) })
    );

    // Text slide-up
    textOpacity.value = withDelay(700, withTiming(1, { duration: 500 }));
    textY.value = withDelay(700, withSpring(0, { damping: 16, stiffness: 100 }));

    // Auto dismiss
    const timer = setTimeout(() => {
      onFinish();
      requestAllPermissions();
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textY.value }],
  }));

  return (
    <Animated.View exiting={FadeOut.duration(600)} style={styles.container}>
      {/* Background radial glow */}
      <View style={styles.glow} />

      {/* Ring burst */}
      <Animated.View style={[styles.ring, ringStyle]} />

      {/* Logo card */}
      <Animated.View style={[styles.logoCard, logoStyle]}>
        {/* Shimmer overlay */}
        <Animated.View style={[styles.shimmer, shimmerStyle]} />
        <Image source={require('../assets/images/brand-mark.png')} style={{ width: 70, height: 70 }} />
      </Animated.View>

      {/* App name */}
      <Animated.Text style={[styles.appName, textStyle]}>
        Chat App
      </Animated.Text>
      <Animated.Text style={[styles.tagline, textStyle]}>
        where conversations come alive.
      </Animated.Text>
    </Animated.View>
  );
}

async function registerForPushNotificationsAsync() {
  try {
    // Channels are already created at module load time
    // Just request permission and get the FCM token
    await notifee.requestPermission();
    const messaging = getMessaging();
    const token = await getToken(messaging);
    const previous = await AsyncStorage.getItem('fcmToken');
    await AsyncStorage.setItem('fcmToken', token);
    console.log('[FCM] FCM token obtained and stored');
    // Logged in and the token changed since login: tell the server where to push
    if (token !== previous && await getAccessToken()) {
      AuthAPI.patch('/profile/device-tokens', { fcm_token: token })
        .catch((err) => console.info('[FCM] token sync failed', err));
    }
  } catch (error) {
    console.error('[FCM] Error registering for push notifications:', error);
  }
}

export let currentScreen = "";

function RootLayoutContent() {
  const navRef = useNavigationContainerRef();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // The native splash stays until we hide it (preventAutoHideAsync above). Our AnimatedSplash
    // is on screen now, so hand over to it. Dev builds hid it for us, release builds never did.
    SplashScreen.hideAsync().catch(() => undefined);
    initDB();
    initVideoCache();
    const unsubscribe = navRef.addListener("state", () => {
      const route = navRef.getCurrentRoute();
      if (route) currentScreen = route.name;
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    setShowSplash(true);
    registerForPushNotificationsAsync();
  }, []);

  return (
    <>
      <DbUpdateProvider>
        <SocketProvider>
          {showSplash && (
            <AnimatedSplash onFinish={() => setShowSplash(false)} />
          )}
          <FriendContactProvider>
            <Stack ref={navRef}>
              <Stack.Screen name="index" options={{ title: "Home", headerShown: false }} />
              <Stack.Screen name="screens/login" options={{ title: "Login", headerShown: false }} />
              <Stack.Screen name="screens/verify" options={{ title: "Verify OTP", headerShown: false }} />
              <Stack.Screen name="screens/register" options={{ title: "Create Profile", headerShown: false, gestureEnabled: false }} />
              <Stack.Screen name="screens/chat" options={{ title: "Chats", headerShown: false, animation: "none" }} />
              <Stack.Screen name="screens/room" options={{ title: "Room", headerShown: false }} />
              <Stack.Screen name="screens/chatSearchScreen" options={{ title: "Search Chats", headerShown: false }} />
              <Stack.Screen name="screens/messageInfo" options={{ title: "Message Info", headerShown: false }} />
              <Stack.Screen name="screens/roomDetails" options={{ title: "Room Details", headerShown: false }} />
              <Stack.Screen name="screens/createGroup/createGroup" options={{ title: "Create Group", headerShown: false }} />
              <Stack.Screen name="screens/createGroup/selectContacts" options={{ title: "Select contacts", headerShown: false }} />
              <Stack.Screen name="screens/contacts" options={{ title: "Select Contact", headerShown: false }} />
              <Stack.Screen name="screens/disappearingMsgs" options={{ title: "Disappearing Msgs", headerShown: false }} />
              <Stack.Screen name="screens/selfDestructingMsgs" options={{ title: "Self Destructing Msgs", headerShown: false }} />
              <Stack.Screen name="screens/shareContact" options={{ title: "Contact to send", headerShown: false }} />
              <Stack.Screen name="screens/callScreens/videoIncomingCall" options={{ headerShown: false }} />
              <Stack.Screen name="screens/callScreens/videoInCall" options={{ headerShown: false }} />
              <Stack.Screen name="screens/statusScreens/statusScreen" options={{ title: "Status", headerShown: false, animation: "none" }} />
              <Stack.Screen name="screens/backupScreen" options={{ title: "Backups", headerShown: false }} />
              <Stack.Screen name="screens/settingsScreen" options={{ title: "Settings", headerShown: false }} />
              <Stack.Screen name="screens/profileScreen" options={{ title: "Profile", headerShown: false }} />
              <Stack.Screen name="screens/reels/reelsScreen" options={{ title: "Reels", headerShown: false, animation: "none" }} />
              <Stack.Screen name="screens/reels/reelViewer" options={{ title: "Reels", headerShown: false }} />
              <Stack.Screen name="screens/reels/uploadReel" options={{ title: "New Reel", headerShown: false, animation: "slide_from_bottom" }} />
              <Stack.Screen name="screens/reels/userProfile" options={{ title: "Profile", headerShown: false }} />
              <Stack.Screen name="screens/reels/findPeople" options={{ title: "Find People", headerShown: false }} />
              <Stack.Screen name="screens/blockedContacts" options={{ title: "Blocked Contacts", headerShown: false }} />
              <Stack.Screen name="screens/twoStep" options={{ title: "Two-Step Verification", headerShown: false }} />
              <Stack.Screen name="screens/reels/followList" options={{ title: "Followers", headerShown: false }} />
            </Stack>
          </FriendContactProvider>
          <AppLock />
        </SocketProvider>
      </DbUpdateProvider>
    </>
  )
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NotificationProvider>
        <RootLayoutContent />
      </NotificationProvider>
    </GestureHandlerRootView>
  )
}

const ACCENT = colors.primaryDark;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    overflow: 'hidden',
  },

  glow: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: ACCENT,
    opacity: 0.12,
  },

  ring: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: ACCENT,
  },

  logoCard: {
    width: 120,
    height: 120,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 20,
  },

  shimmer: {
    position: 'absolute',
    top: -20,
    width: 60,
    height: 200,
    backgroundColor: 'rgba(255,255,255,0.12)',
    transform: [{ rotate: '25deg' }],
    zIndex: 1,
  },

  appName: {
    marginTop: 28,
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 6,
  },

  tagline: {
    marginTop: 8,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.5,
  },
});