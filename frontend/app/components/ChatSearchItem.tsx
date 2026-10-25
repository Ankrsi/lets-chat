import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function ChatSearchItem({ chat, query, onPress }: any) {
    const timeAgo = (timestamp: any) => {
        if (!timestamp) return "";
        const now: Date = new Date();
        const past: Date = new Date(timestamp);
        const diffMs = now.getTime() - past.getTime();
        const seconds = Math.floor(diffMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return `just now`;
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days === 1) return "Yesterday";
        if (days < 7) return `${days}d ago`;

        return past.toLocaleDateString() || "";
    };
    return (
        <TouchableOpacity onPress={onPress} style={styles.container}>
            <View>
                <View style={{ marginBottom: 4, flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={styles.name}>{chat.name || "Unknown"}</Text>
                    <Text style={styles.timestamp}>{timeAgo(chat.lastMessageDate)}</Text>
                </View>
                <Text style={styles.message} numberOfLines={1}>
                    {chat.lastMessage}
                    {/* {highlight(chat.lastMessage || "", query)} */}
                </Text>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: 12,
        borderBottomWidth: 0.5,
        borderColor: "#eee",
    },
    name: { 
        color: "#fff", 
        fontWeight: "600", 
        fontSize: 16,
        maxWidth: "80%",
    },
    message: { color: "#a1a1a1ff", marginTop: 2 },
    label: {
        fontSize: 15,
        // color: "#25D366",
        color: "#fff",
        marginBottom: 2,
    },
    timestamp: {
        fontSize: 12,
        color: "#888",
        marginBottom: 4,
    },
});
