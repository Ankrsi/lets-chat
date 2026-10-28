import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAccessToken } from "@/utils/tokens";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, PanResponder, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { consumePendingNotificationOpen } from '@/utils/notificationOpen';
import { AuthAPI } from '@/utils/api';
import { saveUser } from '@/utils/session';
import { startStyle } from "./styles";
import { colors, gradients } from "@/theme";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

export default function Index() {
  const SWIPE_THRESHOLD = 50;
  const router = useRouter();
  // const [token, setToken] = useState<string | null>(null);
  // const [fcmToken, setFcmToken] = useState<string | null>(null);
  // const [voipToken, setVoipToken] = useState<string | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  const SLIDES = [
    {
      title: 'ChatApp',
      subtitle: 'Simple. Reliable. Private.',
      description: 'Connect with friends and family instantly. Send messages, photos, and videos with ease.',
    },
    {
      title: 'Fast & Secure',
      subtitle: 'End-to-end encrypted.',
      description: 'Every message you send is fully encrypted. Only you and the recipient can read them — no one else.',
    },
    {
      title: 'Stay Connected',
      subtitle: 'Message anyone, anywhere.',
      description: 'No matter where you are in the world, stay close to the people who matter most.',
    },
  ];

  const btnOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const slideOpacity = useRef(new Animated.Value(1)).current;
  const dotsOpacity = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;
  const btnSlide = useRef(new Animated.Value(40)).current;
  const activeSlideRef = useRef(0);

  useEffect(() => {
    (async () => {
      const t = await getAccessToken();
      if (!t) return;

      // Logged in but no username cached: either sign-up wasn't finished or the
      // cache predates usernames, so ask the server which one it is.
      if (!(await AsyncStorage.getItem("userHandle"))) {
        try {
          const res = await AuthAPI.get("/auth/verify-user");
          await saveUser(res.data.user);
          if (!res.data.user.isRegistered) {
            router.replace("/screens/register");
            return;
          }
        } catch (err: any) {
          // 401 is handled by the API client (back to login); when offline, carry on into the app
          if (err?.status === 401) return;
        }
      }

      router.replace("/screens/chat");
      // App may have been launched (from killed state) by tapping a notification.
      setTimeout(consumePendingNotificationOpen, 0);
    })()
  }, [])

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 55, friction: 7, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 480, useNativeDriver: true }),
      ]),
      Animated.timing(dotsOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(btnSlide, { toValue: 0, duration: 320, useNativeDriver: true }),
        Animated.timing(btnOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 20,

      // Follow finger while dragging
      onPanResponderMove: (_, gestureState) => {
        slideAnim.setValue(gestureState.dx * 0.4);
      },

      // On release — decide to commit or snap back
      onPanResponderRelease: (_, gestureState) => {
        const current = activeSlideRef.current;
        const { dx } = gestureState;

        if (dx < -SWIPE_THRESHOLD && current < SLIDES.length - 1) {
          // Swipe left → next slide
          goToSlide(current + 1, 'left');
        } else if (dx > SWIPE_THRESHOLD && current > 0) {
          // Swipe right → previous slide
          goToSlide(current - 1, 'right');
        } else {
          // Snap back to center
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const goToSlide = (nextIndex: number, direction: 'left' | 'right') => {
    const outX = direction === 'left' ? -300 : 300;
    const inX = direction === 'left' ? 300 : -300;

    Animated.parallel([
      Animated.timing(slideAnim, { toValue: outX, duration: 220, useNativeDriver: true }),
      Animated.timing(slideOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      slideAnim.setValue(inX);
      activeSlideRef.current = nextIndex;
      setActiveSlide(nextIndex);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(slideOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    });
  };

  const onPressIn = () => Animated.spring(btnScale, { toValue: 0.95, useNativeDriver: true }).start();
  const onPressOut = () => Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <View style={startStyle.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ── Brand gradient top half ── */}
      <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={startStyle.topSection}>
        <View style={[startStyle.bubble, startStyle.bubbleLg]} />
        <View style={[startStyle.bubble, startStyle.bubbleSm]} />

        <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity }}>
          <View style={startStyle.logoCircle}>
            <Ionicons name="chatbubbles" size={52} color={colors.primary} />
          </View>
        </Animated.View>
      </LinearGradient>

      {/* ── White bottom half ── */}
      <View style={[startStyle.bottomSection, { overflow: 'hidden' }]}>

        {/* Swipeable carousel area */}
        <View style={{ width: '100%', alignItems: 'center' }} {...panResponder.panHandlers}>
          <Animated.View style={[
            startStyle.textBlock,
            { transform: [{ translateX: slideAnim }], opacity: slideOpacity },
          ]}>
            <Text style={startStyle.appName}>{SLIDES[activeSlide].title}</Text>
            <Text style={startStyle.tagline}>{SLIDES[activeSlide].subtitle}</Text>
            <Text style={startStyle.description}>{SLIDES[activeSlide].description}</Text>
          </Animated.View>
        </View>

        {/* Dots — active dot tracks current slide */}
        <Animated.View style={[startStyle.dots, { opacity: dotsOpacity }]}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goToSlide(i, i > activeSlide ? 'left' : 'right')}>
              <View style={[startStyle.dot, i === activeSlide && startStyle.dotActive]} />
            </TouchableOpacity>
          ))}
        </Animated.View>

        {/* Buttons */}
        <Animated.View style={[startStyle.ctaWrap, { transform: [{ translateY: btnSlide }], opacity: btnOpacity }]}>
          <TouchableOpacity activeOpacity={1} onPressIn={onPressIn} onPressOut={onPressOut}
            onPress={() => router.push("/screens/login")}>
            <Animated.View style={[startStyle.btnGreen, { transform: [{ scale: btnScale }] }]}>
              <Text style={startStyle.btnGreenText}>Login with Phone</Text>
            </Animated.View>
          </TouchableOpacity>
          {/* )} */}
        </Animated.View>

        {/* Terms */}
        <Animated.Text style={[startStyle.terms, { opacity: btnOpacity }]}>
          {'Read our '}
          <Text style={startStyle.termsLink}>Privacy Policy</Text>
          {'. Tap "Login" to accept the '}
          <Text style={startStyle.termsLink}>Terms of Service</Text>
          {'.'}
        </Animated.Text>
      </View>
    </View>
  );
}
