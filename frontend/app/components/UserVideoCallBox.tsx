import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Image, StyleSheet, Text, View } from "react-native";
import { RTCView } from "react-native-webrtc";

const { width, height } = Dimensions.get("window");
const AVATAR_SIZE = 70;

// ─── Single user box ──────────────────────────────────────────────────────────
const UserBox = ({ user, boxWidth, boxHeight, isAudio }: any) => {
    const { isSpeaking, isMuted } = user;

    // Show avatar when the whole call is audio, OR when this specific peer's
    // stream currently has no video track (e.g. they switched video -> audio).
    const hasVideo = !!user?.stream?.stream?.getVideoTracks?.().length;
    const showAvatar = isAudio || !hasVideo;

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

    return (
        <View
            style={[
                styles.userBox,
                { width: boxWidth, height: boxHeight },
                showAvatar && styles.userBoxCentered,
            ]}
        >
            <View>
                <Animated.View
                    style={[
                        showAvatar ? styles.avatarBorderRound : styles.avatarBorder,
                        { borderColor, borderWidth },
                    ]}
                >
                    {showAvatar ? (
                        <Image
                            source={{
                                uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                    (user.name as string) ?? ""
                                )}&background=25d366&color=fff&size=128`,
                            }}
                            style={styles.audioAvatar}
                        />
                    ) : (
                        <RTCView
                            key={user.stream.userId}
                            streamURL={user?.stream?.stream?.toURL()}
                            style={{ width: "100%", height: "100%" }}
                            objectFit="cover"
                            zOrder={0}
                        />
                    )}
                </Animated.View>
            </View>

            <View style={[styles.nameRow, showAvatar && styles.nameRowCentered]}>
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
const UserVideoCallBox = ({ users, speakingUsers = [], mutedUsers = {}, isAudio = false }: {
    users: Array<{ stream: any, name?: String }>;
    speakingUsers?: Array<{ userId: string; volume: number }>;
    mutedUsers?: Record<string, boolean>;
    isAudio?: boolean;
}) => {
    const total = users.length;
    const columns = 2;
    const rows = Math.ceil(total / columns);

    return (
        <View style={styles.container}>
            {users.map((user, index) => {
                const isLastFullWidth = total % 2 === 1 && index === total - 1;
                const uid = user.name as string ?? "";

                // ✅ Find the real-time volume entry for this user
                const speakerEntry = speakingUsers.find((s) => s.userId === uid);

                return (
                    <UserBox
                        key={`${index}-${uid}`}
                        user={{
                            ...user,
                            isSpeaking: !!speakerEntry,
                            isMuted: mutedUsers[uid] ?? false,
                        }}
                        isAudio={isAudio}
                        boxWidth={total == 1 ? width : isLastFullWidth ? width : width / columns}
                        boxHeight={total == 1 ? height : height / rows}
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
        // justifyContent: "center",
        // alignItems: "center",
        backgroundColor: "#111",
    },
    userBoxCentered: {
        justifyContent: "center",
        alignItems: "center",
    },
    avatarWrapper: {
        // width: AVATAR_SIZE + 40,
        // height: AVATAR_SIZE + 40,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 10,
    },
    avatarBorder: {
        borderRadius: 8,
        // padding: 1,
    },
    avatarBorderRound: {
        borderRadius: 999,
    },
    audioAvatar: {
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: 999,
    },
    // avatar: {
    //     width: AVATAR_SIZE,
    //     height: AVATAR_SIZE,
    //     borderRadius: 999,
    // },
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    nameRowCentered: {
        marginTop: 8,
        justifyContent: "center",
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

export default UserVideoCallBox;