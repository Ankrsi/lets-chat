import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Image, StyleSheet, Text, View } from "react-native";

const { width, height } = Dimensions.get("window");
const AVATAR_SIZE = 70;

// ─── Convert dB volume (-70 to 0) → scale (1.0 to 1.6) ──────────────────────
const volumeToScale = (volume: number): number => {
    const clamped = Math.max(-70, Math.min(0, volume));
    const normalized = (clamped + 70) / 70; // 0.0 (silent) → 1.0 (loud)
    return 1 + normalized * 0.6;            // 1.0 → 1.6
};

// ─── Single ring driven by real volume ───────────────────────────────────────
const VolumeRing = ({ volume, delay = 0 }: { volume: number; delay?: number }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const animRef = useRef<Animated.CompositeAnimation | null>(null);

    useEffect(() => {
        animRef.current?.stop();

        if (volume === 0) {
            Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
            return;
        }

        const targetScale = volumeToScale(volume);
        // Louder = faster ring expansion
        const duration = Math.max(150, 700 - Math.abs(volume) * 6);

        animRef.current = Animated.loop(
            Animated.sequence([
                Animated.delay(delay),
                Animated.parallel([
                    Animated.timing(scale, { toValue: targetScale, duration, useNativeDriver: true }),
                    Animated.timing(opacity, { toValue: 0.65, duration: 100, useNativeDriver: true }),
                ]),
                Animated.parallel([
                    Animated.timing(scale, { toValue: 1, duration: 250, useNativeDriver: true }),
                    Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
                ]),
            ])
        );
        animRef.current.start();

        return () => animRef.current?.stop();
    }, [volume]);

    return (
        <Animated.View style={[styles.ring, { transform: [{ scale }], opacity }]} />
    );
};

// ─── Single user box ──────────────────────────────────────────────────────────
const UserBox = ({ user, boxWidth, boxHeight }: any) => {
    const { isSpeaking, volume, isMuted } = user;

    const borderAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(borderAnim, {
            toValue: isSpeaking ? 1 : 0,
            duration: 300,
            useNativeDriver: false,
        }).start();
    }, [isSpeaking]);

    const borderColor = borderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ["#333333", "#4ade80"],
    });
    const borderWidth = borderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 3],
    });

    const activeVolume = isSpeaking ? volume : 0;

    return (
        <View style={[styles.userBox, { width: boxWidth, height: boxHeight }]}>
            <View style={styles.avatarWrapper}>
                {/* 3 staggered rings, each reacts to real-time volume */}
                <VolumeRing volume={activeVolume} delay={0} />
                <VolumeRing volume={activeVolume} delay={150} />
                <VolumeRing volume={activeVolume} delay={300} />

                <Animated.View style={[styles.avatarBorder, { borderColor, borderWidth }]}>
                    <Image source={{ uri: user.avatar }} style={styles.avatar} />
                </Animated.View>
            </View>

            <View style={styles.nameRow}>
                {isMuted && (
                    <View style={styles.muteBadge}>
                        <Text style={styles.muteIcon}>🔇</Text>
                    </View>
                )}
                <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
            </View>
        </View>
    );
};

// ─── Grid ─────────────────────────────────────────────────────────────────────
const UserCallBox = ({ users, speakingUsers = [], mutedUsers = {} }: {
    users: Array<{ name: string; userId?: string; avatar: string }>;
    speakingUsers?: Array<{ userId: string; volume: number }>;
    mutedUsers?: Record<string, boolean>;
}) => {
    const total = users.length;
    const columns = 2;
    const rows = Math.ceil(total / columns);

    return (
        <View style={styles.container}>
            {users.map((user, index) => {
                const isLastFullWidth = total % 2 === 1 && index === total - 1;
                const uid = user.userId ?? user.name;

                // ✅ Find the real-time volume entry for this user
                const speakerEntry = speakingUsers.find((s) => s.userId === uid);

                return (
                    <UserBox
                        key={`${index}-${uid}`}
                        user={{
                            ...user,
                            isSpeaking: !!speakerEntry,
                            volume: speakerEntry?.volume ?? -70, // -70 = silence
                            isMuted: mutedUsers[uid] ?? false,
                        }}
                        boxWidth={isLastFullWidth ? width : width / columns}
                        boxHeight={height / rows}
                    />
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        flexWrap: "wrap",
        width: "100%",
        height: "100%",
    },
    userBox: {
        borderWidth: 1,
        borderColor: "#222",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#111",
    },
    avatarWrapper: {
        width: AVATAR_SIZE + 40,
        height: AVATAR_SIZE + 40,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 10,
    },
    avatarBorder: {
        borderRadius: 999,
        padding: 2,
    },
    avatar: {
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: 999,
    },
    ring: {
        position: "absolute",
        width: AVATAR_SIZE + 20,
        height: AVATAR_SIZE + 20,
        borderRadius: 999,
        borderWidth: 2,
        borderColor: "#4ade80",
    },
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    name: {
        color: "#fff",
        fontSize: 14,
        maxWidth: 120,
    },
    muteBadge: {
        backgroundColor: "#ef4444",
        borderRadius: 999,
        width: 20,
        height: 20,
        justifyContent: "center",
        alignItems: "center",
    },
    muteIcon: {
        fontSize: 10,
    },
});

export default UserCallBox;