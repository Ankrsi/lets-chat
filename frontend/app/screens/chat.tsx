import { useDbUpdate } from "@/contexts/DbUpdateContext";
import { ContactContext } from "@/contexts/FriendContactContext";
import { deleteConversation, getConversationList, pinnedConversation } from "@/db/conversationRepo";
import { getGlobalIsSocketConnected, getGlobalSocket, getGlobalUsername } from "@/utils/globalRefs";
import { offlineMsgStoreApi } from "@/utils/socket";
import { prefetchRoom } from "@/utils/roomPrefetch";
import { Ionicons } from "@expo/vector-icons";
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BottomTabBar from "../components/BottomTabBar";
import CallLogList from "../components/CallLogList";
import { ConvStyle, SectionTabStyles } from "../styles";
import { colors, statusBarStyle } from "@/theme";

interface Chat {
  _id: string;
  type: string;
  name?: string;
  members: string[];
  lastMessage?: { content: string; timestamp: string };
  unreadMsg?: string[];
}

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const CALL_TYPES = ["audio_call", "video_call"];

// Icon + fallback label for each non-text message type in the chat list preview
const PREVIEW_TYPES: Record<string, { icon: IconName; label: string }> = {
  image: { icon: "image-outline", label: "Photo" },
  video: { icon: "videocam-outline", label: "Video" },
  document: { icon: "document-text-outline", label: "Document" },
  audio: { icon: "musical-notes-outline", label: "Audio" },
  voice: { icon: "mic-outline", label: "Voice message" },
  location: { icon: "location-outline", label: "Location" },
  contact: { icon: "person-circle-outline", label: "Contact" },
  audio_call: { icon: "call-outline", label: "Audio call" },
  video_call: { icon: "videocam-outline", label: "Video call" },
  money: { icon: "wallet-outline", label: "Payment" },
};

const lastMessagePreview = (type?: string, text?: string | null): { icon?: IconName; text: string } => {
  const known = type ? PREVIEW_TYPES[type] : undefined;
  if (!known) return { text: text || "No messages yet" };
  // Older rows stored the type itself ("image") or an emoji prefix ("📍 Location", "👤 Name") as the text
  const cleaned = (text ?? "").replace(/^(📍|👤)\s*/u, "").trim();
  const isPlaceholder = !cleaned || cleaned === type || CALL_TYPES.includes(type!);
  return { icon: known.icon, text: isPlaceholder ? known.label : cleaned };
};

const AnimatedHeader = React.memo(({
  selectionMode, selectedCount, pinnedConv,
  onBack, onPin, onDelete, onSettings,
}: any) => {
  const fadeNormal = useRef(new Animated.Value(selectionMode ? 0 : 1)).current;
  const fadeSelection = useRef(new Animated.Value(selectionMode ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeNormal, { toValue: selectionMode ? 0 : 1, duration: 100, useNativeDriver: true }),
      Animated.timing(fadeSelection, { toValue: selectionMode ? 1 : 0, duration: 100, useNativeDriver: true }),
    ]).start();
  }, [selectionMode]);

  return (
    <View style={ConvStyle.header}>
      <Animated.View
        style={[StyleSheet.absoluteFill, ConvStyle.headerInner, { opacity: fadeNormal }]}
        pointerEvents={selectionMode ? 'none' : 'auto'}
      >
        <Text style={ConvStyle.headerTitle}>ChatApp</Text>
        <View style={ConvStyle.headerActions}>
          <TouchableOpacity style={ConvStyle.headerIconBtn} onPress={onSettings}>
            <Ionicons name="settings-outline" size={21} color={colors.text} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.View
        style={[StyleSheet.absoluteFill, ConvStyle.headerInner, { opacity: fadeSelection }]}
        pointerEvents={selectionMode ? 'auto' : 'none'}
      >
        <TouchableOpacity onPress={onBack} style={ConvStyle.headerBack}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={ConvStyle.headerTitle}>{selectedCount} selected</Text>
        <View style={ConvStyle.headerActions}>
          <TouchableOpacity style={ConvStyle.headerIconBtn} onPress={onPin}>
            <MaterialCommunityIcons name={pinnedConv ? "pin" : "pin-off"} size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={ConvStyle.headerIconBtn} onPress={onDelete}>
            <Ionicons name="trash-outline" size={22} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
});

const ChatRowItem = React.memo(({
  item, isSelected, username, viewName, timeAgo, onPress, onLongPress,
}: {
  item: any;
  isSelected: boolean;
  username: string | null;
  viewName: Map<string, any>;
  timeAgo: (t: any) => string;
  onPress: () => void;
  onLongPress: () => void;
}) => {
  const checkAnim = useRef(new Animated.Value(isSelected ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(checkAnim, {
      toValue: isSelected ? 1 : 0,
      useNativeDriver: true,
      tension: 300,
      friction: 15,
    }).start();
  }, [isSelected]);

  const getOtherUserProfile = (members: any) => {
    const other = members[0] === username ? members[1] : members[0];
    const details = viewName.get(other);
    if (!details) return { name: other, phone: other, profile_image: "" };
    return details;
  };

  const otherUser = item.type !== "group" ? getOtherUserProfile(JSON.parse(item.members)) : null;
  const displayName = item.type === "group" ? item.name : otherUser?.name || otherUser?.phone;
  const avatarUri = item.type === "group" ? item.avatar : otherUser?.profile_image;
  const unreadCount = JSON.parse(item?.unreadMsg ?? "[]")?.length ?? 0;
  const preview = lastMessagePreview(item.lastMessageType, item.lastMessage);

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.6}
      style={[ConvStyle.chatRow, isSelected && ConvStyle.chatRowSelected]}
    >
      {/* Checkmark — single spring, native thread only */}
      <Animated.View style={[ConvStyle.checkWrap, { transform: [{ scale: checkAnim }], opacity: checkAnim }]}>
        <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
      </Animated.View>

      {/* Avatar */}
      <View style={ConvStyle.avatarWrap}>
        <Image
          source={avatarUri ? { uri: avatarUri } : require("../../assets/images/user.png")}
          style={ConvStyle.avatar}
        />
      </View>

      {/* Content */}
      <View style={ConvStyle.chatContent}>
        <View style={ConvStyle.chatTopRow}>
          <Text style={ConvStyle.chatName} numberOfLines={1}>{displayName}</Text>
          <Text style={[ConvStyle.chatTime, unreadCount > 0 && { color: colors.primary, fontWeight: '700' }]}>
            {timeAgo(item?.lastMessageDate)}
          </Text>
        </View>

        <View style={ConvStyle.chatBottomRow}>
          <View style={ConvStyle.chatPreviewRow}>
            {item.lastMessageSenderId === username &&
              item.type === "single" &&
              !CALL_TYPES.includes(item.lastMessageType) &&
              !!item?.lastMessageStatus && (
                <Ionicons
                  name={item.lastMessageStatus === "sent" ? "checkmark" : "checkmark-done"}
                  size={16}
                  color={item.lastMessageStatus === "read" ? colors.readTick : colors.textMuted}
                  style={{ marginRight: 3 }}
                />
              )}
            {!!preview.icon && (
              <Ionicons name={preview.icon} size={15} color={colors.textSecondary} style={{ marginRight: 4 }} />
            )}
            <Text style={[ConvStyle.chatMsg, { flexShrink: 1 }]} numberOfLines={1}>
              {preview.text}
            </Text>
          </View>

          <View style={ConvStyle.chatMeta}>
            {item?.pinned == 1 && (
              <Ionicons name="pin" size={14} color={colors.textMuted} style={{ marginRight: 4 }} />
            )}
            {unreadCount > 0 && (
              <View style={ConvStyle.badge}>
                <Text style={ConvStyle.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function Chat() {
  const { dbTick } = useDbUpdate();
  const [chats, setChats] = useState<Chat[]>([]);
  const username = getGlobalUsername();
  const [refrash, setRefrash] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [pinnedConv, setPinnedConv] = useState(true);
  const [selectedChats, setSelectedChats] = useState<any[]>([]);
  const router = useRouter();
  const { viewName } = useContext(ContactContext);
  const [filterType, setFilterType] = useState<"all" | "unread" | "group">("all");
  const [showFABMenu, setShowFABMenu] = useState(false);
  const [section, setSection] = useState<"chats" | "calls">("chats");

  useEffect((() => {
    (async () => {
      let username = await AsyncStorage.getItem("username");
      await offlineMsgStoreApi(username as string);
    })()
  }), [])

  useEffect(() => {
    (async () => {
      setRefrash(false);
      try {
        let convList: any = await getConversationList();
        setChats(convList);
      } catch (err) {
        console.error("Socket setup error:", err);
      }
    })();
  }, [refrash, dbTick]);

  useFocusEffect(
    useCallback(() => {
      const socket = getGlobalSocket();
      socket?.emit("chat:updateLastChatRoom", { username });
      const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
        if (selectionMode) {
          setSelectionMode(false);
          setSelectedChats([]);
          return true;
        }
        if (section === "calls") {
          setSection("chats");
          return true;
        }
        return false;
      });
      return () => {
        backHandler.remove();
      };
    }, [username, getGlobalIsSocketConnected(), selectionMode, section])
  );

  const timeAgo = useCallback((timestamp: any) => {
    if (!timestamp) return "";
    const now = new Date(), past = new Date(timestamp);
    const diff = now.getTime() - past.getTime();
    const s = Math.floor(diff / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (s < 60) return "just now";
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d === 1) return "Yesterday";
    if (d < 7) return `${d}d ago`;
    return past.toLocaleDateString() || "";
  }, []);

  const toggleSelectChat = useCallback((item: any) => {
    setSelectedChats((prev) => {
      const exists = prev.some((it) => it.id === item.id);
      if (exists) {
        const updated = prev.filter((it) => it.id !== item.id);
        if (updated.length === 0) setSelectionMode(false);
        checkPinUnpin(updated);
        return updated;
      } else {
        const selected = [...prev, item];
        checkPinUnpin(selected);
        return selected;
      }
    });
  }, []);

  function checkPinUnpin(arr: any) {
    const pinList = arr.map((it: any) => !!it.pinned);
    if (pinList.length === 1) {
      setPinnedConv(!pinList[0]);
    } else {
      setPinnedConv(!pinList.every((v: boolean) => v === true));
    }
  }

  const handleBulkDelete = async () => {
    if (selectedChats.length === 0) return Alert.alert("No chats selected");
    Alert.alert("Confirm Delete", "Are you sure you want to delete selected chats?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await deleteConversation(selectedChats.map((it: any) => it.id?.toString()), username as string);
            setSelectedChats([]);
            setRefrash(true);
          } catch (err) {
            Alert.alert("Error deleting chats");
          }
        },
      },
    ]);
  };

  const handleBulkPinned = async () => {
    if (selectedChats.length === 0) return Alert.alert("No chats selected");
    Alert.alert("Confirm Pin", "Are you sure you want to pin selected chats?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Pin", style: "destructive",
        onPress: async () => {
          try {
            await pinnedConversation(selectedChats.map((it: any) => it.id?.toString()), pinnedConv);
            setSelectedChats([]);
            setRefrash(true);
          } catch (err) {
            Alert.alert("Error pinning chats");
          }
        },
      },
    ]);
  };

  const getFilteredChats = () => {
    switch (filterType) {
      case "unread": return chats.filter(c => JSON.parse(typeof c?.unreadMsg === 'string' ? c.unreadMsg : "[]")?.length > 0);
      case "group": return chats.filter(c => c.type === "group");
      default: return chats;
    }
  };

  const filteredChats = getFilteredChats();
  const unreadCount = chats.filter(c => JSON.parse(typeof c?.unreadMsg === 'string' ? c.unreadMsg : "[]")?.length > 0).length;
  const groupCount = chats.filter(c => c.type === "group").length;

  const renderItem = useCallback(({ item }: any) => (
    <ChatRowItem
      item={item}
      isSelected={selectedChats.some(c => c.id === item.id)}
      username={username}
      viewName={viewName}
      timeAgo={timeAgo}
      onPress={() => {
        if (selectionMode) toggleSelectChat(item);
        else prefetchRoom(String(item.id)).finally(() => router.push({ pathname: "/screens/room", params: { id: item.id } }));
      }}
      onLongPress={() => {
        if (!selectionMode) setSelectionMode(true);
        toggleSelectChat(item);
      }}
    />
  ), [selectedChats, selectionMode, username, viewName, timeAgo, toggleSelectChat]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={["top", "left", "right"]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={colors.surface} />

      <AnimatedHeader
        selectionMode={selectionMode}
        selectedCount={selectedChats.length}
        pinnedConv={pinnedConv}
        onBack={() => { setSelectionMode(false); setSelectedChats([]); }}
        onPin={handleBulkPinned}
        onDelete={handleBulkDelete}
        onSettings={() => router.navigate('/screens/settingsScreen')}
      />

      {/* Content area above the bottom bar: the FAB is positioned inside it, so the bar never covers it */}
      <View style={{ flex: 1 }}>
      {/* ── Chats / Calls sections ── */}
      <View style={SectionTabStyles.row}>
        {(["chats", "calls"] as const).map((s) => (
          <TouchableOpacity
            key={s}
            style={[SectionTabStyles.tab, section === s && SectionTabStyles.tabActive]}
            onPress={() => { setSection(s); setSelectionMode(false); setSelectedChats([]); setShowFABMenu(false); }}
            activeOpacity={0.7}
          >
            <Text style={[SectionTabStyles.text, section === s && SectionTabStyles.textActive]}>
              {s === "chats" ? "Chats" : "Calls"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {section === "calls" ? <CallLogList /> : (
      <View style={ConvStyle.body}>
        <View style={ConvStyle.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
          <TextInput
            placeholder="Search by mobile, name"
            placeholderTextColor={colors.textMuted}
            style={ConvStyle.searchInput}
            disableFullscreenUI
            onFocus={() => router.navigate("/screens/chatSearchScreen")}
          />
        </View>

        <View style={ConvStyle.filterRow}>
          {(['all', 'unread', 'group'] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[ConvStyle.chip, filterType === f && ConvStyle.chipActive]}
              onPress={() => setFilterType(f)}
            >
              <Text style={[ConvStyle.chipText, filterType === f && ConvStyle.chipTextActive]}>
                {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Groups'}
              </Text>
              {f === 'unread' && unreadCount > 0 && (
                <View style={ConvStyle.chipBadge}><Text style={ConvStyle.chipBadgeText}>{unreadCount}</Text></View>
              )}
              {f === 'group' && groupCount > 0 && (
                <View style={ConvStyle.chipBadge}><Text style={ConvStyle.chipBadgeText}>{groupCount}</Text></View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {filteredChats.length > 0 ? (
          <FlatList
            data={filteredChats}
            keyExtractor={(item: any) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 10 }}
            ItemSeparatorComponent={() => <View style={ConvStyle.separator} />}
            removeClippedSubviews={true}      // unmount off-screen rows from memory
            maxToRenderPerBatch={15}          // rows rendered per batch while scrolling
            initialNumToRender={20}           // rows rendered on first load
            windowSize={10}                   // render 5 screens above + 5 below viewport
            updateCellsBatchingPeriod={50}    // ms between batch renders (lower = smoother)
            getItemLayout={(_, index) => ({   // skip layout measurement — big perf win
              length: 74,                     // must match your row height (paddingVertical 12*2 + content ~50)
              offset: 74 * index,
              index,
            })}
          />
        ) : (
          <View style={ConvStyle.empty}>
            <Ionicons name="chatbubbles-outline" size={64} color={colors.primaryMuted} />
            <Text style={ConvStyle.emptyTitle}>No conversations yet</Text>
            <Text style={ConvStyle.emptySub}>Start a new chat by tapping the + button</Text>
          </View>
        )}
      </View>
      )}

      {showFABMenu && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowFABMenu(false)} />
      )}

      {showFABMenu && (
        <View style={ConvStyle.fabMenu}>
          <TouchableOpacity style={ConvStyle.fabMenuItem}
            onPress={() => { setShowFABMenu(false); router.navigate('/screens/createGroup/selectContacts'); }}>
            <View style={ConvStyle.fabMenuIcon}><Ionicons name="people-outline" size={20} color={colors.primary} /></View>
            <Text style={ConvStyle.fabMenuText}>New Group</Text>
          </TouchableOpacity>
          <TouchableOpacity style={ConvStyle.fabMenuItem}
            onPress={() => { setShowFABMenu(false); router.push("/screens/contacts"); }}>
            <View style={ConvStyle.fabMenuIcon}><Ionicons name="person-add-outline" size={20} color={colors.primary} /></View>
            <Text style={ConvStyle.fabMenuText}>New Chat</Text>
          </TouchableOpacity>
        </View>
      )}

      {section === "chats" && (
        <TouchableOpacity style={ConvStyle.fab} onPress={() => setShowFABMenu(!showFABMenu)} activeOpacity={0.85}>
          <Ionicons name={showFABMenu ? "close" : "add"} size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      </View>

      <BottomTabBar active="chats" />
    </SafeAreaView>
  );
}