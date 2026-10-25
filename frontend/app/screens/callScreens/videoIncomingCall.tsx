import { acceptVideoCall, rejectVideoCall } from "@/contexts/videoCallController";
import { getGlobalSocket, getGlobalUsername } from "@/utils/globalRefs";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function videoIncomingCall() {
    const socket = getGlobalSocket();
    const username = getGlobalUsername();
    const { from, conversationId } = useLocalSearchParams();

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Incoming Video Call</Text>
            <Text style={styles.user}>{from}</Text>
            <View style={styles.row}>
                <TouchableOpacity style={styles.btnAccept} onPress={() => acceptVideoCall(socket!, username!, from.toString(), conversationId.toString())}>
                    <Text style={styles.btnText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnReject} onPress={() => rejectVideoCall(socket!, username!, from.toString())}>
                    <Text style={styles.btnText}>Reject</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#121212" },
    title: { fontSize: 22, color: "#ffffff", marginBottom: 10 },
    user: { fontSize: 28, fontWeight: "bold", color: "#47c4ff" },
    row: { flexDirection: "row", marginTop: 40 },
    btnAccept: { backgroundColor: "#26d75a", padding: 18, borderRadius: 50, marginRight: 20 },
    btnReject: { backgroundColor: "#ff4040", padding: 18, borderRadius: 50 },
    btnText: { fontSize: 18, color: "#fff" },
});
