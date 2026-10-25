import React, { useRef } from "react";
import {
  Animated,
  PanResponder,
  View,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const SWIPE_THRESHOLD = 50;

export default function SwipeReply({
  children,
  onReply,
}: {
  children: React.ReactNode;
  onReply: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10,

      onPanResponderMove: (_, gesture) => {
        // only allow swipe RIGHT
        if (gesture.dx > 0) {
          translateX.setValue(gesture.dx);
        }
      },

      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          onReply?.();
        }

        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
        }).start();
      },
    })
  ).current;

  const iconOpacity = translateX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.replyIcon,
          { opacity: iconOpacity },
        ]}
      >
        <Ionicons name="arrow-undo" size={20} color="#25D366" />
      </Animated.View>

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  replyIcon: {
    position: "absolute",
    left: 10,
    top: "50%",
    marginTop: -10,
    zIndex: 1,
  },
});
