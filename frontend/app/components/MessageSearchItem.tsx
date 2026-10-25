import { ContactContext } from "@/contexts/FriendContactContext";
import React, { useContext } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function MessageSearchItem({ message, username, query, onPress }: any) {
    const { viewName } = useContext(ContactContext);
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
            <View style={{ marginBottom: 4, flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.label}>{viewName.get(message.members[0] == username ? message.members[1] : message.members[0])?.name}</Text>
                <Text style={styles.timestamp}>{timeAgo(message.timestamp)}</Text>
            </View>
            <Text style={styles.text} numberOfLines={2}>
                {typeof message.content === "string" ? message.content : message.content?.msg || ""}
                {/* {highlight(
                    typeof message.content === "string"
                        ? message.content
                        : message.content?.msg || "",
                    query
                )} */}
            </Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: 12,
        borderBottomWidth: 0.5,
        borderColor: "#eee",
    },
    label: {
        fontSize: 15,
        // color: "#25D366",
        color: "#fff",
        marginBottom: 2,
    },
    text: {
        fontSize: 14,
        color: "#a1a1a1ff",
    },
    timestamp: {
        fontSize: 12,
        color: "#888",
        marginBottom: 4,
    },
});
