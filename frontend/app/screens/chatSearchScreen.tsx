import ChatSearchItem from "@/app/components/ChatSearchItem";
import MessageSearchItem from "@/app/components/MessageSearchItem";
import { CHATAPI } from "@/utils/api";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { styles } from "../styles";
import { getGlobalUsername } from "@/utils/globalRefs";

export default function ChatSearchScreen() {
    const username = getGlobalUsername();
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState({
        conversations: [],
        messages: [],
    });

    // function debounce(func: Function, delay: number) {
    //     let timeout: any;
    //     return function (...args: any[]) {
    //         clearTimeout(timeout);
    //         timeout = setTimeout(() => {
    //             func.apply(null, args);
    //         }, delay);
    //     };
    // }
    // const dSearch = useMemo(() => {
    //     return debounce(async (query: string) => {
    //         if (query.trim() == "") return;
    //         console.log("Searching for:", query);
    //         const resp = await CHATAPI.get(`/chats/chatSearch?q=${query}`);
    //         console.log("Search response:", resp.data);
    //     }, 800);
    // }, []);
    // const handleSearch = async (text: string) => {
    //     setSearchQuery(text);
    //     dSearch(text);
    // };

    useEffect(() => {
        if (!query.trim()) {
            setResults({ conversations: [], messages: [] });
            return;
        }

        const timeout = setTimeout(async () => {
            setLoading(true);
            try {
                const resp = await CHATAPI.get(`/chats/chatSearch?q=${query}`);
                const data = await resp.data;
                setResults(data);
            } catch (e) {
                console.error(e);
            }
            setLoading(false);
        }, 300);

        return () => clearTimeout(timeout);
    }, [query]);

    return (
        <SafeAreaView style={[styles.container]}>
            <View style={{ flex: 1, paddingHorizontal: 20 }}>
                {/* Search Bar */}
                <View style={styles.searchBar}>
                    <Ionicons name="search" size={20} color="#C8C8D3" style={{ marginRight: 8 }} />
                    <TextInput
                        placeholder="Search by message, name…"
                        placeholderTextColor="#C8C8D3"
                        style={styles.searchInput}
                        value={query}
                        onChangeText={setQuery}
                    />
                </View>

                {loading && <ActivityIndicator style={{ marginTop: 20 }} />}

                <FlatList
                    data={[
                        ...results?.conversations.map((c: any) => ({ ...c, type: "chat" })),
                        ...results?.messages.map((m: any) => ({ ...m, type: "message" })),
                    ]}
                    keyExtractor={(item, index) => item._id || item.messageId + index}
                    renderItem={({ item }) => {
                        if (item.type === "chat") {
                            return (
                                <ChatSearchItem
                                    chat={item}
                                    query={query}
                                    username={username}
                                // onPress={() =>
                                //   navigation.navigate("Chat", {
                                //     conversationId: item._id,
                                //   })
                                // }
                                />
                            );
                        }

                        return (
                            <MessageSearchItem
                                message={item}
                                query={query}
                                username={username}
                            //   onPress={() =>
                            //     navigation.navigate("Chat", {
                            //       conversationId: item.conversationId,
                            //       scrollToMessageId: item.messageId,
                            //     })
                            //   }
                            />
                        );
                    }}
                    ListEmptyComponent={
                        !loading && query ? (
                            <Text style={localStyles.empty}>No results found</Text>
                        ) : null
                    }
                />
            </View>
        </SafeAreaView>
    );
}

const localStyles = StyleSheet.create({
    searchInput: {
        // backgroundColor: "#f0f0f0",
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        color: "white",
        fontSize: 16,
    },
    empty: {
        textAlign: "center",
        marginTop: 50,
        color: "#999",
    },
});
