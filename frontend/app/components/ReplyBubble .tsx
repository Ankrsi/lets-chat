import React from "react";
import { View, Text, StyleSheet } from "react-native";

const ReplyBubble = ({
    isMe,
    replyTo,
    getUserProfile
}: any) => {
    const profile = getUserProfile(replyTo?.senderId);
    return (
        <View>
            {replyTo && (
                <View style={styles.replyBox}>
                    <Text style={styles.replyName}>
                        {replyTo.senderId == isMe ? "Me" : profile.name ? profile.name : replyTo.senderId}
                    </Text>
                    <Text
                        numberOfLines={1}
                        style={styles.replyText}
                    >
                        {replyTo.messageType == "text" ? replyTo.content?.msg : replyTo.messageType}
                    </Text>
                </View>
            )}
        </View>
    );
};

export default ReplyBubble;

const styles = StyleSheet.create({
    replyBox: {
        backgroundColor: "#00000010",
        borderLeftWidth: 4,
        borderLeftColor: "#25D366",
        padding: 6,
        borderRadius: 6,
        marginBottom: 6,
    },

    replyName: {
        fontWeight: "600",
        fontSize: 12,
        color: "#25D366",
    },

    replyText: {
        fontSize: 12,
        color: "#444",
    },
});
