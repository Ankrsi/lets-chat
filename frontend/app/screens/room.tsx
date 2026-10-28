import { ContactContext } from "@/contexts/FriendContactContext";
import { getOpenRoomId, setOpenRoomId } from "@/utils/globalRefs";
import { readReceiptsOn } from "@/utils/privacy";
import { startGroupVideoCall } from "@/contexts/groupVideoCallService";
import { startVideoCall } from "@/contexts/videoCallController";
import { clearUnreadMessages, getConversationById, getUnreadMessageData, updateConversationLastMessage, updateConversationLastMessageText } from "@/db/conversationRepo";
import { deleteMessageById, lastMsgsByConvId, saveMessage, updateMessageData } from "@/db/messageRepo";
import { CHATAPI } from "@/utils/api";
import { Ionicons } from "@expo/vector-icons";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions
} from "react-native";
import { colors } from "@/theme";
import { MAX_UPLOAD_BYTES, MediaItem, mediaFromPickerAsset, safeFileName, uploadToPresignedUrl } from "@/utils/media";
import { SafeAreaView } from "react-native-safe-area-context";
import AudioPlayer from "../components/AudioPlayer";
import DeleteMessageModal from "../components/chatDeleteModal";
import EmojiPicker from "../components/EmojiPicker";
import ImageGrid from "../components/ImageGrid";
import ReplyBubble from "../components/ReplyBubble ";
import MediaPreviewModal from "../components/MediaPreviewModal";
import MessageComposer, { ComposerHandle } from "../components/MessageComposer";
import MessageActionSheet, { MessageAction } from "../components/MessageActionSheet";
import DocumentCard from "../components/DocumentCard";
import LocationCard from "../components/LocationCard";
import ContactCard from "../components/ContactCard";
import LocationPickerModal from "../components/LocationPickerModal";
import { ensureLocationAccess, SharedLocation } from "@/utils/location";
import SwipeReply from "../components/SwipeReply";
import UploadMediaLoader from "../components/UploadMediaLoader";
import VideoGrid from "../components/VideoGrid";
import { RoomHeaderStyles, RoomStyles } from "../styles";
import { useDbUpdate } from "@/contexts/DbUpdateContext";
import { getGlobalSocket, getGlobalUsername, setGlobalDbTick } from "@/utils/globalRefs";
import { offlineMsgStoreApi } from "@/utils/socket";
import { takePrefetchedRoom } from "@/utils/roomPrefetch";
import { encryptOutgoingEdit, encryptOutgoingMessage, hasSecureChat, refreshPeerBundle } from "@/utils/e2ee";

/* ── Message row (module scope: a component defined inside ChatScreen would get a new
   identity on every render, remounting every message and reloading its media) ── */

const SENDER_COLORS = [
  "#2f708bff",
  "#2e9253ff",
  "#926b31ff",
  "#802f8fff",
  "#912e4fff",
  "#364391ff",
  "#318b82ff",
];
// Kept out of SENDER_COLORS so unsaved numbers never look like a saved contact.
const UNSAVED_COLOR = "#B0BEC5";

const getSenderColor = (senderId: string) => {
  let hash = 0;
  for (let i = 0; i < senderId.length; i++) {
    hash = senderId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
};

const profileOf = (viewName: Map<string, any> | undefined, memberId: any) =>
  viewName?.get(memberId) ?? { name: memberId, phone: memberId, profile_image: "" };

// Non-contacts are shown by their profile name, so also show the number.
const showNumberWithName = (viewName: Map<string, any> | undefined, memberId: any) => {
  const details = viewName?.get(memberId);
  return !!details && !details.isContact && !!details.name && details.name !== memberId;
};

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

function formatDuration(startISO: any, endISO: any) {
  const start: any = new Date(startISO);
  const end: any = new Date(endISO);

  let diff = Math.floor((end - start) / 1000);

  const hours = Math.floor(diff / 3600);
  diff %= 3600;

  const minutes = Math.floor(diff / 60);
  const seconds = diff % 60;

  let str = "";

  if (hours > 0) str += `${hours}h `;
  if (minutes > 0) str += `${minutes}m `;
  if (seconds > 0) str += `${seconds}s`;

  return str.trim();
}

const parseContent = (item: any): Record<string, any> => {
  if (!item?.content) return {};
  if (typeof item.content !== "string") return item.content;
  try { return JSON.parse(item.content) ?? {}; } catch { return {}; }
};

const readMessageText = (item: any): string => {
  const c = parseContent(item);
  const caption = Array.isArray(c.caption) ? c.caption.filter(Boolean).join("\n") : c.caption;
  return (typeof c.msg === "string" ? c.msg : "") || caption || "";
};

const PREVIEW_ICONS: Record<string, { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string }> = {
  image: { icon: "image-outline", label: "Photo" },
  video: { icon: "videocam-outline", label: "Video" },
  document: { icon: "document-text-outline", label: "Document" },
  audio: { icon: "musical-notes-outline", label: "Audio" },
  voice: { icon: "mic-outline", label: "Voice message" },
  location: { icon: "location-outline", label: "Location" },
  contact: { icon: "person-circle-outline", label: "Contact" },
  audio_call: { icon: "call-outline", label: "Audio call" },
  video_call: { icon: "videocam-outline", label: "Video call" },
};

const messagePreview = (item: any) => {
  const known = PREVIEW_ICONS[item?.messageType];
  const c = parseContent(item);
  const text = readMessageText(item) || (item?.messageType === "document" ? c.name : "") || (item?.messageType === "contact" ? c.name : "");
  return { icon: known?.icon, text: text || known?.label || "Message" };
};

const MessageRow = React.memo(
  function MessageRow({ item, user, isSelected, selecting, onPress, onLongPress, viewName, router, id }: any) {
    // Cards inside the bubble (image, document, map…) take the touch, so they get the long press too
    const longPress = () => onLongPress(item);
    let content: Record<string, any> = {};
    let reply: Record<string, any> | null = null;
    try {
      try {
        content =
          typeof item.content === "string"
            ? JSON.parse(item.content)
            : (item.content ?? {});
      }
      catch {
        content = {};
      }
      try {
        reply =
          typeof item.replyToMessage === "string"
            ? JSON.parse(item.replyToMessage)
            : (item.replyToMessage ?? null);
      }
      catch {
        reply = null;
      }
    } catch (err) {
      console.info(err)
    }

    if (item.messageType === "group_create") {
      return (<View style={{ alignItems: "center", marginVertical: 10, width: "100%" }} key={item.messageId}>
        <View style={RoomStyles.systemMessage}>
          <Text style={RoomStyles.systemMessageText}>
            {profileOf(viewName, item.senderId)?.name || item.senderId} created this group
          </Text>
          <Text style={RoomStyles.systemMessageSubText}>
            {/* Group {members.length} members */}
          </Text>
          <Text style={RoomStyles.systemMessageTime}>
            Members can add people or invite them using a link.
          </Text>
          {/* add members */}
          <View style={{ flexDirection: 'row', marginTop: 10, width: "100%", justifyContent: 'space-between' }}>
            <TouchableOpacity style={{ width: "100%", backgroundColor: "#33279c93", borderRadius: 10, padding: 5 }} onPress={() => {
              router.push({
                pathname: '/screens/createGroup/selectContacts',
                params: { conversationId: id, addMemberInGroup: 'true' }
              });
            }}>
              <Text style={{ color: "#fff", fontSize: 15, textAlign: 'center' }}>➕ Add members</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', marginTop: 10, width: "100%", justifyContent: 'space-between' }}>
            <TouchableOpacity style={{ width: "100%", backgroundColor: "#33279c93", borderRadius: 10, padding: 5 }} onPress={() => {
              // router.push({
              //   pathname: '/screens/roomDetails',
              //   params: { id }
              // });
            }}>
              <Text style={{ color: "#1f2020ff", fontSize: 15, textAlign: 'center' }}>🔗 Invite via link</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>)
    }

    return (
      <Pressable
        onPress={() => onPress(item)}
        onLongPress={longPress}
        style={[
          { paddingHorizontal: 10, marginVertical: 4 },
          isSelected && RoomStyles.selectedChatRow,
        ]}
      >
        {/* While selecting, taps go to the row (select) instead of opening the card inside */}
        <View
          pointerEvents={selecting ? "none" : "auto"}
          style={[
            RoomStyles.message,
            item.senderId === user ? RoomStyles.me : RoomStyles.them,
          ]}
        >
          {/* item.senderId */}
          {item.senderId !== user && (
            <Text style={{ fontSize: 12, color: showNumberWithName(viewName, item.senderId) ? UNSAVED_COLOR : getSenderColor(item.senderId), fontWeight: '500', marginBottom: 2 }}>
              {showNumberWithName(viewName, item.senderId) ? `~${profileOf(viewName, item.senderId)?.name}` : profileOf(viewName, item.senderId)?.name}
              {showNumberWithName(viewName, item.senderId) && (
                <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '400' }}>{`  ${item.senderId}`}</Text>
              )}
            </Text>
          )}
          {reply && (<ReplyBubble
            isMe={user}
            replyTo={reply}
            getUserProfile={(memberId: any) => profileOf(viewName, memberId)}
          />
          )}

          {item.forwarded == 1 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}>
              <Ionicons name="arrow-redo" size={12} color={colors.textMuted} />
              <Text style={{ fontSize: 11, fontStyle: 'italic', color: colors.textSecondary }}>Forwarded</Text>
            </View>
          )}

          {item.messageType === "text" && (
            <Text style={{ color: colors.text, fontSize: 15, lineHeight: 20 }}>
              {content.msg}
            </Text>
          )}

          {item.messageType === "image" &&
            <ImageGrid urls={content?.urls ?? []} onLongPress={longPress} />
          }

          {item.messageType === "video" &&
            <VideoGrid urls={content?.urls ?? []} onLongPress={longPress} />
          }

          {item.messageType === "document" && (
            <DocumentCard
              url={content?.url}
              name={content?.name || item.fileName || "Document"}
              size={content?.size}
              mimeType={content?.mimeType}
              onLongPress={longPress}
            />
          )}

          {item.messageType === "contact" && <ContactCard content={content} onLongPress={longPress} />}
          {item.messageType === "money" && (
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: "italic" }}>Payment (no longer supported)</Text>
          )}

          {item.messageType === "voice" && (
            <AudioPlayer data={item} user={user} onLongPress={longPress} />
          )}

          {item.messageType === "audio" && (
            <AudioPlayer data={item} user={user} onLongPress={longPress} />
          )}

          {item.messageType === "location" && <LocationCard content={content} onLongPress={longPress} />}

          {(item.messageType == "audio_call" || item.messageType == "video_call") && (
            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                RoomStyles.callCard,
                {
                  backgroundColor: item?.senderId === user ? "rgba(99,102,241,0.10)" : colors.surfaceAlt,
                  alignSelf: item?.senderId === user ? "flex-end" : "flex-start",
                },
              ]}
              onLongPress={longPress}
              onPress={() => {
                // optional: open call details / redial
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: content.status == "missed" ? colors.dangerSoft : colors.primarySoft }}>
                <Ionicons
                  name={content.status == "missed" ? (item.messageType == "audio_call" ? "call-outline" : "videocam-off-outline") : item.messageType == "audio_call" ? "call-outline" : "videocam-outline"}
                  size={20}
                  color={content.status == "missed" ? colors.danger : colors.primary}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text
                  style={[
                    RoomStyles.callTitle,
                    { color: colors.text },
                  ]}
                >
                  {item.messageType == "audio_call" ? "Audio Call" : "Video Call"}
                </Text>
                <Text
                  style={[
                    RoomStyles.callSubtitle,
                    { color: content.status == "missed" ? colors.danger : colors.textSecondary },
                  ]}
                >
                  {content.status === "missed"
                    ? "Missed call"
                    : content.status === "rejected"
                      ? "Call rejected"
                      : content.status === "ended"
                        ? `Call ended • ${formatDuration(content.endedAt, content.startedAt) || "00:00"}`
                        : "Tap to call again"}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {["image", "video", "document"].includes(item.messageType) && !!content?.caption && (
            <Text style={{ color: colors.text, fontSize: 15, marginTop: 6 }}>
              {Array.isArray(content.caption) ? content.caption.filter(Boolean).join("\n") : content.caption}
            </Text>
          )}

          {item.caption && (
            <Text style={{ color: colors.text, fontSize: 15 }}>
              {item.caption}
            </Text>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>
              {timeAgo(item.timestamp)}
            </Text>
            {item.senderId === user && (
              <Ionicons
                name={item.status === 'read' || item.status === 'delivered' ? 'checkmark-done' : 'checkmark'}
                size={16}
                color={item.status === 'read' ? colors.readTick : colors.textMuted}
              />
            )}
          </View>
        </View>
      </Pressable>
    );
  },
  (prev: any, next: any) => {
    if (prev.isSelected !== next.isSelected || prev.selecting !== next.selecting || prev.user !== next.user || prev.viewName !== next.viewName) return false;
    if (prev.onPress !== next.onPress || prev.onLongPress !== next.onLongPress) return false;
    if (prev.item === next.item) return true;
    const keys = new Set([...Object.keys(prev.item ?? {}), ...Object.keys(next.item ?? {})]);
    for (const k of keys) if (prev.item?.[k] !== next.item?.[k]) return false;
    return true;
  },
);

export default function ChatScreen() {
  const { dbTick } = useDbUpdate();
  const socket = getGlobalSocket();
  const { id } = useLocalSearchParams();
  // Tells incoming-message handling which chat is open (for read receipts)
  useEffect(() => {
    setOpenRoomId(String(id));
    return () => {
      if (getOpenRoomId() === String(id)) setOpenRoomId(null);
    };
  }, [id]);
  // Data read just before navigating here (chat list); null when opened another way
  const [prefetched] = useState(() => takePrefetchedRoom(String(id)));
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const router = useRouter();
  const [roomInfo, setRoomInfo] = useState<any>(prefetched?.conv ?? {});
  const secureChecked = useRef(false);
  const statusRequested = useRef(false);
  const [messages, setMessages] = useState<any[]>(prefetched?.messages ?? []);
  // The input keeps its own text (see MessageComposer): typing no longer re-renders this screen
  const composerRef = useRef<ComposerHandle>(null);
  const [typing, setTyping] = useState(false);
  const [memberStatus, setMemberStatus] = useState<string[]>([]);
  const username = getGlobalUsername();
  const flatListRef = useRef<FlatList>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedMsgs, setSelectedMsgs] = useState<any[]>([]);
  const [selectedMsgsData, setSelectedMsgsData] = useState<any[]>([]);
  const [isScroll, setIsScroll] = useState<boolean>(false);
  // Messages that were unread when the room opened (null until checked): the first one is
  // where the room opens, with an "N unread messages" divider above it
  const [unreadIds, setUnreadIds] = useState<string[] | null>(prefetched?.unreadIds ?? null);
  const unreadCountRef = useRef(prefetched?.unreadIds.length ?? 0);
  // The list stays invisible until it's loaded and positioned (latest or first unread), then fades in
  const [loaded, setLoaded] = useState(!!prefetched);
  const [listReady, setListReady] = useState(false);
  const listOpacity = useRef(new Animated.Value(0)).current;
  const readyTimer = useRef<any>(null);
  const markReadySoon = (ms = 0) => {
    clearTimeout(readyTimer.current);
    readyTimer.current = setTimeout(() => setListReady(true), ms);
  };
  const [unreadAnchor, setUnreadAnchor] = useState<{ id: string; count: number } | null>(null);
  const initialScrollDone = useRef(false);
  const scrollRetriesRef = useRef(0);
  const [isEdit, setIsEdit] = useState<boolean>(false);
  const [showActions, setShowActions] = useState(false); // options sheet for the selected messages
  const [selectionMode, setSelectionMode] = useState(false);
  const [replyMsg, setReplyMsg] = useState<any>(null);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [progress, setProgress] = useState<number>(0);
  // Picked files waiting in the preview (images, videos or documents)
  const [pendingMedia, setPendingMedia] = useState<MediaItem[]>([]);
  const [captions, setCaptions] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  // true when neither side has blocked the other. Derived from the room data while rendering (not set
  // after an async load), so the input shows on the first frame when the room was preloaded.
  const blocked = useMemo(() => {
    if (!roomInfo?.members) return false; // room data not loaded yet
    try {
      const members: string[] = JSON.parse(roomInfo.members || "[]");
      const other = members[0] == username ? members[1] : members[0];
      const blockedBy: string[] = JSON.parse(roomInfo.blockedBy || "[]");
      return !(blockedBy.includes(other) || blockedBy.includes(username as string));
    } catch {
      return true;
    }
  }, [roomInfo?.members, roomInfo?.blockedBy, username]);
  const [otherPubKey, setOtherPubKey] = useState<string>("");
  const [secure, setSecure] = useState<boolean>(true);
  const { width: screenWidth } = useWindowDimensions();

  const { viewName } = useContext(ContactContext);

  // ✅ Initialize socket and user
  useFocusEffect(
    useCallback(() => {
      const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
        if (selectionMode) {
          setSelectionMode(false);
          setSelectedMsgs([]);
          return true;
        }
        return false;
      });
      // members
      (async () => {
        // Playback mode by default (recording mode routes iPhone audio to the quiet earpiece);
        // the mic permission is asked when you actually record
        setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
        // let username = await AsyncStorage.getItem("username");
        socket?.emit("registerUser", { senderId: username });
        socket?.emit("chat:join", { conversationId: id, username });

        socket?.on("chat:statusList", ({ conversationId, online }) => {
          if (conversationId == id) {
            setMemberStatus(online);
          }
        });
        // socket?.on("chat:updateStatus", () => {
        socket?.on("chat:updateStatusList", () => {
          socket?.emit("chat:status", { conversationId: id, username: username, members: JSON.parse(roomInfo?.members || '[]') });
        })

        socket?.on("chat:typing", ({ conversationId, typing, username: usr }: any) => {
          if (conversationId === id && username !== usr) setTyping(typing);
        });

        const unreadData: any = await getUnreadMessageData(id as string) || "[]";
        let unreadMsgTemp: any = JSON.parse(typeof unreadData?.unreadMsg === 'string' ? unreadData.unreadMsg : '[]');
        const unreadList: string[] = Array.isArray(unreadMsgTemp) ? unreadMsgTemp.map(String) : [];
        if (unreadIds === null) {
          unreadCountRef.current = unreadList.length;
          setUnreadIds(unreadList);
        }
        if (unreadList.length) {
          if (readReceiptsOn()) socket?.emit("chat:markAsRead", { messageIds: unreadMsgTemp, conversationId: id, username, timestamp: new Date().toISOString() });
          await clearUnreadMessages(id as string);
          setGlobalDbTick();
        }
      })();
      return () => {
        socket?.emit("chat:updateLastChatRoom", { username: username });
        socket?.off("chat:join");
        socket?.off("chat:markAsRead");
        socket?.off("chat:typing");
        socket?.off("chat:statusList");
        socket?.off("chat:updateStatusList");
        backHandler.remove();
      };
    }, [socket, id])
  );

  // On every local DB change: the messages and room details only (cheap local reads)
  useEffect(() => {
    (async () => {
      try {
        const chatData: any = await getConversationById(id as string);
        const lastMessages = await lastMsgsByConvId(id as string, Math.max(50, unreadCountRef.current + 20));
        setRoomInfo(chatData);
        setMessages(lastMessages);
        setLoaded(true);
      } catch (err) {
        console.error("Error fatch:", err);
      }
    })();
  }, [dbTick]);

  // Once per room (and until the chat becomes secure): peer, encryption status, presence request.
  // These used to run on every DB change, i.e. on every message sent or received.
  useEffect(() => {
    if (!roomInfo?.members) return;
    let cancelled = false;
    (async () => {
      try {
        const members = JSON.parse(roomInfo.members || '[]');
        const peer = members[0] == username ? members[1] : members[0];
        setOtherUser(peer);
        if (!secure || !secureChecked.current) {
          const secureStatus = await secureOrNot(roomInfo.type, roomInfo.type == "group" ? roomInfo.id : peer);
          if (!cancelled) setSecure(secureStatus);
          secureChecked.current = true;
        }
        if (!statusRequested.current) {
          statusRequested.current = true;
          socket?.emit("chat:status", { conversationId: id, username: username, members });
        }
      } catch (err) {
        console.error("room setup failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [roomInfo?.members, roomInfo?.type, secure ? 1 : dbTick]);

  useEffect(() => {
    (async () => {
      if (otherUser && otherPubKey == "" && roomInfo.type == "single") {
        // Always re-fetch so a reinstall on their side (new keys) is picked up.
        const bundle = await refreshPeerBundle(otherUser).catch((err) => {
          console.info("e2ee bundle fetch failed", err);
          return null;
        });
        setOtherPubKey(bundle?.identityDHPub || "none");
        await offlineMsgStoreApi(username as string);
      }
    })();
  }, [otherUser]);

  const sendToSocket = async (messageType: string, actualData: any, roomInfo: any, replyMsg: any = null) => {
    const socketData = {
      messageId: Crypto.randomUUID(),
      conversationId: id,
      senderId: username,
      content: actualData,
      messageType: messageType,
      conv_type: roomInfo.type,
      status: "sent",
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    if (replyMsg) {
      (socketData as any)['replyToMessage'] = replyMsg || null;
    }

    // Show it straight away, shaped like a stored row (the DB reload then confirms it). Copied
    // before encryption, which rewrites the outgoing payload.
    setMessages((prev: any[]) => [...prev, {
      ...socketData,
      content: JSON.stringify(actualData),
      replyToMessage: replyMsg ? JSON.stringify(replyMsg) : null,
      reactions: null,
      caption: null,
      edited: 0,
      forwarded: 0,
      active: 1,
    }]);

    await saveMessage(socketData);

    await updateConversationLastMessage({
      id: id,
      lastMessageId: socketData.messageId,
      lastMessage: socketData.messageType === "location" ? "📍 Location" : socketData.content.msg || socketData.content.caption || socketData.messageType,
      lastMessageType: socketData.messageType,
      lastMessageSenderId: username,
      lastMessageStatus: "sent",
      lastMessageDate: new Date().toISOString(),
    }, username!);
    setGlobalDbTick();
    try {
      await encryptOutgoingMessage(socketData);
    } catch (err: any) {
      Alert.alert("Message not sent", err?.message ?? "It couldn't be encrypted. Try again.");
      return null;
    }
    socket?.emit("chat:send-message", socketData);
    return null;
  };

  // Inverted list: offset 0 is the latest message (the visual bottom)
  // Show the "scroll to latest" button once you've scrolled up (state only changes when that flips)
  const handleScroll = (e: any) => {
    setIsScroll(e.nativeEvent.contentOffset.y > 50);
  };

  // Voice notes: hold the mic to record, release to send
  const recording = useRef<{ started: Promise<boolean> | null; at: number }>({ started: null, at: 0 });

  const startRecord = (): Promise<boolean> => {
    const started = (async () => {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Microphone permission needed",
          "Allow microphone access to send voice messages.",
          perm.canAskAgain ? [{ text: "OK" }] : [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }],
        );
        return false;
      }
      try {
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
        recording.current.at = Date.now();
        return true;
      } catch (err) {
        console.info("start recording failed", err);
        return false;
      }
    })();
    recording.current.started = started;
    return started;
  };

  const stopRecording = async (): Promise<{ uri: string; duration: number } | null> => {
    const started = await (recording.current.started ?? Promise.resolve(false));
    recording.current.started = null;
    if (!started) return null;
    try {
      await audioRecorder.stop();
    } catch (err) {
      console.info("stop recording failed", err);
      return null;
    } finally {
      setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
    }
    const duration = (Date.now() - recording.current.at) / 1000;
    if (!audioRecorder.uri || duration < 1) return null; // a tap, not a voice note
    return { uri: audioRecorder.uri, duration };
  };

  // Send a text message
  const sendMessage = async (value: string) => {
    if (!value.trim()) return;
    setEmojiOpen(false);
    stopTyping();
    const actualData = { msg: value };
    await sendToSocket("text", actualData, roomInfo, replyMsg);
    setReplyMsg(null);
    scrollToLatest();
  };

  // Send a edit text message
  const sendEditMessage = async (value: string) => {
    if (!value.trim()) return;
    setEmojiOpen(false);
    stopTyping();
    setIsEdit(false);
    let payload: any = {
      "messageId": selectedMsgsData[0].messageId,
      "conversationId": id,
      "username": username,
      "newMessage": value,
      "conv_type": roomInfo?.type
    }
    clearSelection();
    await updateMessageData(payload);
    await updateConversationLastMessageText(payload.conversationId, payload.newMessage);
    setGlobalDbTick();
    await encryptOutgoingEdit(payload);
    socket?.emit("chat:editMessage", payload);
    setReplyMsg(null);
    scrollToLatest();
  };

  const handleAddRecent = (emoji: string) => {
    setRecentEmojis(prev => {
      const filtered = prev.filter(e => e !== emoji);
      return [emoji, ...filtered].slice(0, 32);
    });
  };

  // Typing indicator: "typing" once when you start (refreshed every 3 s while you keep typing) and
  // "stopped" 1.5 s after the last key or when you send. Not two events + a timer per keystroke.
  const typingState = useRef<{ active: boolean; lastSent: number; timer: any }>({ active: false, lastSent: 0, timer: null });
  const emitTyping = (typing: boolean) => {
    socket?.emit("chat:typing", { conversationId: id, username: username, typing });
  };
  const stopTyping = () => {
    const t = typingState.current;
    clearTimeout(t.timer);
    if (t.active) emitTyping(false);
    t.active = false;
  };
  const notifyTyping = () => {
    const t = typingState.current;
    const now = Date.now();
    if (!t.active || now - t.lastSent > 3000) {
      emitTyping(true);
      t.active = true;
      t.lastSent = now;
    }
    clearTimeout(t.timer);
    t.timer = setTimeout(stopTyping, 1500);
  };
  useEffect(() => () => clearTimeout(typingState.current.timer), []);

  const openPreview = (items: MediaItem[]) => {
    const tooBig = items.filter((it) => it.size && it.size > MAX_UPLOAD_BYTES);
    if (tooBig.length) Alert.alert("File too large", `Files can be up to 100 MB. Skipped: ${tooBig.map((it) => it.name).join(", ")}`);
    const ok = items.filter((it) => !(it.size && it.size > MAX_UPLOAD_BYTES));
    if (!ok.length) return;
    setPendingMedia(ok);
    setCaptions(ok.map(() => ""));
    setShowPreview(true);
  };

  const fromPickerAsset = mediaFromPickerAsset;

  // Upload Image
  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (res.canceled) return;
    openPreview(res.assets.map(fromPickerAsset));
  };

  // Upload Video
  const pickVideo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (res.canceled) return;
    openPreview(res.assets.map(fromPickerAsset));
  };

  // Camera: photo or video
  // Camera (button in the message box): tap = photo, long-press = video.
  // Android's camera intent captures one kind at a time, so photo and video are separate launches.
  const takeWithCamera = async (kind: "photo" | "video" = "photo") => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Camera permission needed",
          "Allow camera access to take photos and videos.",
          perm.canAskAgain ? [{ text: "OK" }] : [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }],
        );
        return;
      }
      const res = await ImagePicker.launchCameraAsync(
        kind === "video"
          ? { mediaTypes: ["videos"], videoMaxDuration: 60, quality: 1 }
          : { mediaTypes: ["images"], quality: 0.85 },
      );
      if (res.canceled || !res.assets?.length) return;
      openPreview(res.assets.map((a) => ({
        ...fromPickerAsset(a),
        // camera captures often have no file name / type
        kind: kind === "video" ? "video" as const : "image" as const,
        name: a.fileName || (kind === "video" ? `video_${Date.now()}.mp4` : `photo_${Date.now()}.jpg`),
        mimeType: a.mimeType || (kind === "video" ? "video/mp4" : "image/jpeg"),
      })));
    } catch (err: any) {
      console.info("camera failed", err);
      Alert.alert("Camera unavailable", err?.message || "Couldn't open the camera.");
    }
  };

  const sendMedia = async () => {
    const items = pendingMedia;
    const caps = captions.map((c) => (c || "").trim());
    setShowPreview(false);
    setPendingMedia([]);
    setCaptions([]);
    if (!items.length) return;

    try {
      const { data } = await CHATAPI.post("/chats/getPresignedUrl", {
        conversationId: id as string,
        data: items.map((it) => ({ fileName: safeFileName(it.name), mediaType: it.mimeType })),
      });

      // One progress bar across all files
      for (let i = 0; i < items.length; i++) {
        await uploadToPresignedUrl(data[i].uploadUrl, items[i], (f) =>
          setProgress(Math.max(1, Math.round(((i + f) / items.length) * 100))),
        );
      }

      for (const kind of ["image", "video"] as const) {
        const group = items.map((it, i) => ({ it, i })).filter(({ it }) => it.kind === kind);
        if (!group.length) continue;
        if (group.every(({ i }) => !caps[i])) {
          await sendToSocket(kind, { urls: group.map(({ it, i }) => ({ url: data[i].fileUrl, name: it.name })) }, roomInfo);
        } else {
          for (const { it, i } of group) {
            await sendToSocket(kind, { urls: [{ url: data[i].fileUrl, name: it.name }], ...(caps[i] && { caption: caps[i] }) }, roomInfo);
          }
        }
      }
      for (const [i, it] of items.entries()) {
        if (it.kind !== "document") continue;
        await sendToSocket("document", {
          url: data[i].fileUrl,
          name: it.name,
          size: it.size ?? null,
          mimeType: it.mimeType,
          ...(caps[i] && { caption: caps[i] }),
        }, roomInfo);
      }
    } catch (error: any) {
      console.error("❌ Media upload failed:", error?.data || error?.message);
      Alert.alert("Couldn't send", error?.message || "Upload failed. Try again.");
    } finally {
      setProgress(0);
    }
  };

  // Upload Audio
  const pickAudio = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const file = res.assets[0];
    const item: MediaItem = {
      uri: file.uri,
      kind: "document",
      name: file.name || "audio.mp3",
      mimeType: file.mimeType || "audio/mpeg",
      size: file.size ?? null,
    };
    if (item.size && item.size > MAX_UPLOAD_BYTES) return Alert.alert("File too large", "Audio files can be up to 100 MB.");
    try {
      const { data } = await CHATAPI.post("/chats/getPresignedUrl", {
        conversationId: id as string,
        data: [{ fileName: safeFileName(item.name), mediaType: item.mimeType }],
      });
      await uploadToPresignedUrl(data[0].uploadUrl, item, (f) => setProgress(Math.max(1, Math.round(f * 100))));
      await sendToSocket("audio", {
        url: data[0].fileUrl,
        name: item.name,
        size: item.size,
        mimeType: item.mimeType,
        urls: [{ url: data[0].fileUrl, name: item.name }], // older app versions read urls[0]
      }, roomInfo);
    } catch (error: any) {
      console.error("❌ Audio upload failed:", error?.data || error?.message);
      Alert.alert("Couldn't send audio", error?.message || "Try again.");
    } finally {
      setProgress(0);
    }
  };

  // Upload Document
  const pickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      multiple: true,
      copyToCacheDirectory: true, // a file:// copy the uploader can read
    });
    if (res.canceled) return;
    openPreview(res.assets.map((f) => ({
      uri: f.uri,
      kind: "document" as const,
      name: f.name || "Document",
      mimeType: f.mimeType || "application/octet-stream",
      size: f.size ?? null,
    })));
  };

  // Share Location
  // Location: open the WhatsApp-style picker (map, current location or a chosen place)
  const shareLocation = async () => {
    if (await ensureLocationAccess()) setShowLocationPicker(true);
  };

  const sendLocation = (loc: SharedLocation) => {
    sendToSocket("location", {
      msg: `${loc.lat},${loc.lng}`, // kept for older app versions
      lat: loc.lat,
      lng: loc.lng,
      accuracy: loc.accuracy,
      address: loc.address,
    }, roomInfo);
  };

  // Upload voice
  const sendVoiceNote = async (uri: string, duration: number) => {
    const name = `voice_${Crypto.randomUUID()}.m4a`;
    const item: MediaItem = { uri, kind: "document", name, mimeType: "audio/mp4" };
    try {
      const { data } = await CHATAPI.post("/chats/getPresignedUrl", {
        conversationId: id as string,
        data: [{ fileName: name, mediaType: item.mimeType }],
      });
      await uploadToPresignedUrl(data[0].uploadUrl, item, (f) => setProgress(Math.max(1, Math.round(f * 100))));
      await sendToSocket("voice", { url: data[0].fileUrl, name, duration: duration.toFixed(1) }, roomInfo);
    } catch (error: any) {
      console.error("❌ Voice note upload failed:", error?.data || error?.message);
      Alert.alert("Couldn't send voice message", error?.message || "Try again.");
    } finally {
      setProgress(0);
    }
  };

  const scrollToLatest = (animated = true) => flatListRef.current?.scrollToOffset({ offset: 0, animated });

  // Newest first for the inverted list: index 0 renders at the bottom, so the room opens on the latest
  // message and stays anchored there (keyboard, taller input, rows measuring) without any scrolling
  const listData = useMemo(() => [...messages].reverse(), [messages]);

  // Once, when the room opens with unread messages: put the first unread one at the top of the screen
  useEffect(() => {
    if (initialScrollDone.current || unreadIds === null) return;
    if (listData.length === 0) {
      if (loaded) markReadySoon(0); // empty chat: nothing to position
      return;
    }
    const unread = new Set(unreadIds);
    // listData is newest first, so the first (oldest) unread message is the last match
    let index = -1;
    for (let i = listData.length - 1; i >= 0; i--) {
      if (unread.has(String(listData[i].messageId))) { index = i; break; }
    }
    // Many unread: the first (50-message) load may not reach them yet; wait for the larger reload
    if (index < 0 && unreadIds.length > 0 && messages.length === 50 && unreadIds.length + 20 > 50) return;
    initialScrollDone.current = true;
    if (index < 0) return markReadySoon(0); // nothing unread: the latest message is already in view
    setUnreadAnchor({ id: String(listData[index].messageId), count: unreadIds.length });
    if (index === 0) return markReadySoon(0); // only the latest message is unread: it's already at the bottom
    requestAnimationFrame(() => {
      // In an inverted list viewPosition 1 = top of the screen
      flatListRef.current?.scrollToIndex({ index, viewPosition: 1, animated: false });
      markReadySoon(120); // show once the jump has landed
    });
  }, [listData, unreadIds, loaded]);

  // Fade the list in once positioned; never keep it hidden for long
  useEffect(() => {
    if (listReady) Animated.timing(listOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }, [listReady]);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => setListReady(true), 1500);
    return () => clearTimeout(t);
  }, [loaded]);
  useEffect(() => () => clearTimeout(readyTimer.current), []);

  // Rows have different heights, so scrollToIndex can fail before they're measured:
  // jump to an estimate, then retry once rows around it have rendered
  const handleScrollToIndexFailed = (info: { index: number; averageItemLength: number }) => {
    flatListRef.current?.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index), animated: false });
    if (scrollRetriesRef.current >= 5) return markReadySoon(150);
    scrollRetriesRef.current += 1;
    markReadySoon(300);
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index: info.index, viewPosition: 1, animated: false });
    }, 120);
  };

  // Android back button closes the attachment menu first (registered last, so it runs first)
  const toggleOptionsRef = useRef<(forceClose?: boolean) => void>(() => undefined);
  useEffect(() => {
    if (!showOptions) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      toggleOptionsRef.current(true);
      return true;
    });
    return () => sub.remove();
  }, [showOptions]);

  const toggleOptions = (forceClose = false) => {
    if (showOptions || forceClose) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => setShowOptions(false));
    } else {
      setShowOptions(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  };

  const handleOption = (type: string) => {
    toggleOptions(true);
    if (type === "Image") pickImage();
    else if (type === "Video") pickVideo();
    else if (type === "Audio") pickAudio();
    else if (type === "Document") pickDocument();
    else if (type === "Location") shareLocation();
    else if (type === "Contact") router.push({
      pathname: "/screens/shareContact",
      params: { id }
    });
  };

  const setSelectedItem = (item: any) => {
    let selected = [...selectedMsgs];
    let selectedData = [...selectedMsgsData];
    const exists = selected.find((msgId) => msgId === item.messageId);
    if (exists) {
      selected = selected.filter((msgId) => msgId !== item.messageId);
      selectedData = selectedData.filter((msg) => msg.messageId !== item.messageId);
    } else {
      selected.push(item.messageId);
      selectedData.push(item);
    }
    setSelectionMode(true);
    setSelectedMsgs(selected);
    setSelectedMsgsData(selectedData);
  }

  const handlePress = (item: any) => {
    if (selectedMsgs.length > 0) {
      setSelectedItem(item);
    }
    else {
      setSelectionMode(false);
    }
  };

  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedMsgs([]);
    setSelectedMsgsData([]);
  };

  // Long press selects the message; the ⋮ in the header then opens its options.
  const handleLongPress = (item: any) => setSelectedItem(item);

  const closeActions = (clear = false) => {
    setShowActions(false);
    if (clear) clearSelection();
  };

  // Options for the selected messages. Reply / Copy / Edit / Info only make sense for one message.
  const messageActions = (items: any[], canWrite: boolean): MessageAction[] => {
    if (!items.length) return [];
    const single = items.length === 1 ? items[0] : null;
    const text = single ? readMessageText(single) : "";
    const actions: MessageAction[] = [];
    if (single && canWrite) {
      actions.push({
        key: "reply", label: "Reply", icon: "arrow-undo-outline",
        onPress: () => { setReplyMsg(single); closeActions(true); composerRef.current?.focus(); },
      });
    }
    if (single?.messageType === "text" && text) {
      actions.push({
        key: "copy", label: "Copy", icon: "copy-outline",
        onPress: async () => {
          closeActions(true);
          try {
            const Clipboard = require("expo-clipboard");
            await Clipboard.setStringAsync(text);
          } catch {
            Alert.alert("Copy isn't available", "Rebuild the app to enable copying messages.");
          }
        },
      });
    }
    actions.push({
      key: "forward", label: "Forward", icon: "arrow-redo-outline",
      onPress: () => {
        closeActions(true);
        router.push({
          pathname: '/screens/createGroup/selectContacts',
          params: { conversationId: id, forward: 'true', messages: JSON.stringify(items) }
        });
      },
    });
    const mine = single?.senderId === username;
    if (single && mine && canWrite && single.messageType === "text") {
      actions.push({
        key: "edit", label: "Edit", icon: "create-outline",
        onPress: () => { closeActions(); editMsgFun(single); },
      });
    }
    if (single && mine) {
      actions.push({
        key: "info", label: "Info", icon: "information-circle-outline",
        onPress: () => {
          closeActions(true);
          router.push({
            pathname: '/screens/messageInfo',
            params: { messageId: single.messageId, convId: single.conversationId, type: roomInfo?.type },
          });
        },
      });
    }
    actions.push({
      key: "delete", label: items.length > 1 ? `Delete ${items.length} messages` : "Delete", icon: "trash-outline", danger: true,
      onPress: () => { closeActions(); setShowDeleteModal(true); },
    });
    return actions;
  };

  const handleDeleteMsgs = () => {
    setShowDeleteModal(true);
  };

  const forwardMsg = () => {
    router.push({
      pathname: '/screens/createGroup/selectContacts',
      params: { conversationId: id, forward: 'true', messages: JSON.stringify(selectedMsgsData) }
    });
  }

  const handleDeleteSelected = async (deleteFor: string) => {
    if (selectedMsgs.length === 0) return;

    await deleteMessageById(id as string, selectedMsgs);
    const allMine = selectedMsgsData.every((m: any) => m.senderId === username);
    if (deleteFor === "everyone" && allMine) {
      socket?.emit("chat:deleteMessages", {
        conversationId: id,
        messageIds: selectedMsgs,
        username: username,
      });
    }

    clearSelection();
    setShowDeleteModal(false);
    setGlobalDbTick();
  };

  const getUserProfile = (memberId: any) => {
    const details = viewName.get(memberId);
    if (!details) {
      return {
        name: memberId,
        phone: memberId,
        profile_image: ""
      };
    }
    return details;
  }

  const getOtherUserProfile = (members: any) => {
    const details = viewName?.get(members[0] == username ? members[1] : members[0])
    if (!details) return {
      name: members[0] == username ? members[1] : members[0],
      phone: members[0] == username ? members[1] : members[0],
      profile_image: ""
    };
    return details;
  }

  const editMsgFun = (item: any = selectedMsgsData[0]) => {
    composerRef.current?.setText(readMessageText(item));
    composerRef.current?.focus();
    setIsEdit(true);
  }

  const secureOrNot = async (type: string, id: string) => {
    return hasSecureChat(type, id);
  }

  // Rows get callbacks that never change identity; they read the latest handlers from a ref.
  // Otherwise every render would hand each memoized row new functions and re-render it.
  const rowHandlers = useRef({ handlePress, handleLongPress });
  rowHandlers.current = { handlePress, handleLongPress };
  const onRowPress = useCallback((item: any) => rowHandlers.current.handlePress(item), []);
  const onRowLongPress = useCallback((item: any) => rowHandlers.current.handleLongPress(item), []);

  const renderItem = useCallback(
    ({ item }: any) => (
      <>
      {unreadAnchor?.id === String(item.messageId) && (
        <View style={RoomStyles.unreadDivider}>
          <Text style={RoomStyles.unreadDividerText}>
            {unreadAnchor.count} unread message{unreadAnchor.count === 1 ? "" : "s"}
          </Text>
        </View>
      )}
      <SwipeReply onReply={() => setReplyMsg(item)}>
        <MessageRow
          item={item}
          user={username}
          isSelected={selectedMsgs.includes(item.messageId)}
          selecting={selectedMsgs.length > 0}
          onPress={onRowPress}
          onLongPress={onRowLongPress}
          viewName={viewName}
          router={router}
          id={id}
        />
      </SwipeReply>
      </>
    ),
    [username, selectedMsgs, viewName, onRowPress, onRowLongPress, router, id, unreadAnchor]
  );

  const composerHandlers = useRef<any>({});
  toggleOptionsRef.current = toggleOptions;
  composerHandlers.current = { closeOptions: () => showOptions && toggleOptions(true), sendMessage, sendEditMessage, isEdit, toggleOptions, startRecord, stopRecording, sendVoiceNote, notifyTyping, takeWithCamera };
  const composerProps = useMemo(() => ({
    onToggleEmoji: () => { Keyboard.dismiss(); setEmojiOpen((v) => !v); },
    onFocusInput: () => { setEmojiOpen(false); composerHandlers.current.closeOptions(); },
    onAttach: () => composerHandlers.current.toggleOptions(false),
    onCamera: () => composerHandlers.current.takeWithCamera("photo"),
    onCameraVideo: () => composerHandlers.current.takeWithCamera("video"),
    onSend: (value: string) => {
      const h = composerHandlers.current;
      return h.isEdit ? h.sendEditMessage(value) : h.sendMessage(value);
    },
    onTyping: () => composerHandlers.current.notifyTyping(),
    onStartRecord: () => composerHandlers.current.startRecord(),
    onStopRecord: async () => {
      const h = composerHandlers.current;
      const result = await h.stopRecording();
      if (result) h.sendVoiceNote(result.uri, result.duration);
    },
  }), []);

  const compact = screenWidth < 380; // small phones: smaller controls so the name has room
  const H = {
    bar: [RoomHeaderStyles.bar, compact && RoomHeaderStyles.barCompact],
    iconBtn: [RoomHeaderStyles.iconBtn, compact && RoomHeaderStyles.iconBtnCompact],
    identity: [RoomHeaderStyles.identity, compact && RoomHeaderStyles.identityCompact],
    avatarWrap: [RoomHeaderStyles.avatarWrap, compact && RoomHeaderStyles.avatarWrapCompact],
    avatar: [RoomHeaderStyles.avatar, compact && RoomHeaderStyles.avatarCompact],
    title: [RoomHeaderStyles.title, compact && RoomHeaderStyles.titleCompact],
    sub: [RoomHeaderStyles.sub, compact && RoomHeaderStyles.subCompact],
    actions: [RoomHeaderStyles.actions, compact && RoomHeaderStyles.actionsCompact],
    actionBtn: [RoomHeaderStyles.actionBtn, compact && RoomHeaderStyles.actionBtnCompact],
    selectionTitle: [RoomHeaderStyles.selectionTitle, compact && RoomHeaderStyles.selectionTitleCompact],
  };
  const iconSize = compact ? 20 : 22;
  const roomMembers: string[] = JSON.parse(roomInfo?.members || "[]");
  const isActiveMember = roomMembers.includes(username as string)
    && !(roomInfo?.removedMembers || [])?.includes(username) && blocked;
  const isOnline = memberStatus?.length > 0;
  const headerTitle = roomInfo?.type === "single"
    ? getUserProfile(roomMembers[0] == username ? roomMembers[1] : roomMembers[0])?.name
    : roomInfo?.name;
  const headerAvatar = roomInfo?.type === "group"
    ? roomInfo?.avatar
    : getOtherUserProfile(roomMembers)?.profile_image;
  const headerSubtitle = roomInfo?.type === "single"
    ? (isOnline ? "Online" : "Tap for contact info")
    : isOnline
      ? `${memberStatus.length} online`
      : roomMembers.map((num: any) => getUserProfile(num)?.name || num).join(", ");

  return (
    <SafeAreaView style={RoomStyles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        // keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, flexDirection: 'column' }}>
          {/* Tap anywhere outside the attachment menu to close it. The input area (with the menu)
              sits above this layer, so the menu stays tappable. */}
          {showOptions && (
            <TouchableWithoutFeedback onPress={() => toggleOptions(true)}>
              <View style={RoomStyles.roomOverlay} />
            </TouchableWithoutFeedback>
          )}
          <View style={H.bar}>
            {selectedMsgs.length > 0 ? (
              <>
                <TouchableOpacity style={H.iconBtn} onPress={() => { clearSelection(); setIsEdit(false); }} hitSlop={8}>
                  <Ionicons name="close" size={iconSize} color={colors.text} />
                </TouchableOpacity>
                <Text style={H.selectionTitle} maxFontSizeMultiplier={1.2}>{selectedMsgs.length} selected</Text>
                <View style={H.actions}>
                  <TouchableOpacity style={H.iconBtn} onPress={handleDeleteMsgs} hitSlop={6}>
                    <Ionicons name="trash-outline" size={iconSize} color={colors.danger} />
                  </TouchableOpacity>
                  <TouchableOpacity style={H.iconBtn} onPress={forwardMsg} hitSlop={6}>
                    <Ionicons name="arrow-redo-outline" size={iconSize} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity style={H.iconBtn} onPress={() => setShowActions(true)} hitSlop={6} accessibilityLabel="More options">
                    <Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity style={H.iconBtn} onPress={() => router.back()} hitSlop={8}>
                  <Ionicons name="chevron-back" size={compact ? 24 : 26} color={colors.text} />
                </TouchableOpacity>

                {/* Avatar + name + status → room details */}
                <Pressable
                  style={H.identity}
                  onPress={() => router.navigate({ pathname: "/screens/roomDetails", params: { id } })}
                >
                  <View style={H.avatarWrap}>
                    <Image source={headerAvatar ? { uri: headerAvatar } : require("../../assets/images/user.png")} style={H.avatar} />
                    {roomInfo?.type === "single" && isOnline && <View style={RoomHeaderStyles.onlineDot} />}
                  </View>
                  <View style={RoomHeaderStyles.titleWrap}>
                    <Text style={H.title} numberOfLines={1} maxFontSizeMultiplier={1.2}>{headerTitle}</Text>
                    {isActiveMember && (
                      <View style={RoomHeaderStyles.subRow}>
                        {roomInfo && otherUser && (
                          <Ionicons
                            name={secure ? "lock-closed" : "lock-open-outline"}
                            size={11}
                            color={secure ? colors.success : colors.textMuted}
                          />
                        )}
                        <Text style={[H.sub, roomInfo?.type === "single" && isOnline && RoomHeaderStyles.subOnline]} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                          {headerSubtitle}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>

                {isActiveMember && (
                  <View style={H.actions}>
                    <TouchableOpacity
                      style={H.actionBtn}
                      onPress={() => { roomInfo?.type == "group" ? startGroupVideoCall(socket!, username as string, id as string, "audio") : startVideoCall(socket!, username as string, JSON.parse(roomInfo?.members)[0] == username ? JSON.parse(roomInfo?.members)[1] : JSON.parse(roomInfo?.members)[0], id.toString(), setGlobalDbTick, "audio") }}
                      accessibilityLabel="Voice call"
                    >
                      <Ionicons name="call-outline" size={compact ? 17 : 19} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={H.actionBtn}
                      onPress={() => { roomInfo?.type == "group" ? startGroupVideoCall(socket!, username as string, id as string, "video") : startVideoCall(socket!, username as string, JSON.parse(roomInfo?.members)[0] == username ? JSON.parse(roomInfo?.members)[1] : JSON.parse(roomInfo?.members)[0], id.toString(), setGlobalDbTick, "video") }}
                      accessibilityLabel="Video call"
                    >
                      <Ionicons name="videocam-outline" size={compact ? 19 : 21} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
          <View style={RoomStyles.chatLists}>
            <Animated.View style={{ flex: 1, opacity: listOpacity }}>
            <FlatList
              ref={flatListRef}
              data={listData}
              inverted
              onScroll={handleScroll}
              // inverted: paddingTop is the space under the latest message
              contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
              keyExtractor={(item) => item.messageId}
              renderItem={renderItem}
              onScrollToIndexFailed={handleScrollToIndexFailed}
              initialNumToRender={20}        // Render only first 20 messages
              maxToRenderPerBatch={20}       // Batch size for virtualization
              windowSize={10}                // Number of items outside viewport to render
              removeClippedSubviews={true}   // Unmount items outside viewport
              keyboardShouldPersistTaps="handled"
              updateCellsBatchingPeriod={50} // Lower batching period
              scrollEventThrottle={16}       // Smooth scroll
            />
            </Animated.View>
            {typing && <Text style={{ padding: 6 }}>Typing...</Text>}
            {isScroll && (
              <TouchableOpacity
                style={RoomStyles.scrollDownBtn}
                onPress={() => scrollToLatest()}
                accessibilityLabel="Scroll to latest message"
              >
                <Ionicons name="chevron-down" size={22} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {progress > 0 && <UploadMediaLoader progress={progress} />}

          {replyMsg && (
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: colors.surface,
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderLeftWidth: 4,
              borderLeftColor: colors.primary,
              marginBottom: 4,
              marginHorizontal: 8,
              borderRadius: 12,
            }}>
              <Ionicons name="arrow-undo" size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>
                  {replyMsg?.senderId === username ? "Replying to yourself" : `Replying to ${getUserProfile(replyMsg?.senderId)?.name || replyMsg?.senderId}`}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 13 }}>
                  {messagePreview(replyMsg).text}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyMsg(null)} hitSlop={10} accessibilityLabel="Cancel reply">
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {((roomInfo.members || [])?.includes(username) &&
            !(roomInfo.removedMembers || [])?.includes(username)) && blocked ? (
            <View style={[RoomStyles.chatFooter, showOptions && { zIndex: 30, elevation: 30 }]}>

              {/* Attachment tray: comes out of the top edge of the input bar. The clip area ends exactly at
                  that edge, so the card is never drawn over the input while it opens or closes. */}
              {showOptions && (
                <View style={RoomStyles.optionClip} pointerEvents="box-none">
                <Animated.View
                  style={[RoomStyles.optionBox, {
                    opacity: fadeAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
                    transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [280, 0] }) }],
                  }]}
                >
                  <View style={RoomStyles.optionHandle} />
                  <View style={RoomStyles.optionGrid}>
                    {[
                      { key: "Image", label: "Photos", color: "#8B5CF6", icon: "images" },
                      { key: "Video", label: "Videos", color: "#3B82F6", icon: "videocam" },
                      { key: "Document", label: "Document", color: "#6366F1", icon: "document-text" },
                      { key: "Location", label: "Location", color: "#10B981", icon: "location" },
                      { key: "Contact", label: "Contact", color: "#F59E0B", icon: "person" },
                      { key: "Audio", label: "Audio", color: "#EC4899", icon: "musical-notes" },
                    ].map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={RoomStyles.optionItem}
                        onPress={() => handleOption(opt.key)}
                        activeOpacity={0.7}
                        accessibilityLabel={opt.label}
                      >
                        <View style={[RoomStyles.optionIcon, { backgroundColor: opt.color + "1F" }]}>
                          <Ionicons name={opt.icon as any} size={26} color={opt.color} />
                        </View>
                        <Text style={RoomStyles.optionLabel}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Animated.View>
                </View>
              )}

              {/* Input row */}
              <MessageComposer ref={composerRef} emojiOpen={emojiOpen} {...composerProps} />
            </View>
          ) : (
            <View style={[RoomStyles.chatFooter, { padding: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }]}>
              {(roomInfo?.removedMembers || [])?.includes(username) && (
                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                  You can't send messages to this group because you're no longer a member.
                </Text>
              )}
              {roomInfo?.blocked == '1' && (
                <Text style={{ color: '#667781', fontSize: 13, textAlign: 'center' }}>
                  You are blocked in this conversation.
                </Text>
              )}
            </View>
          )}
        </View>
        {emojiOpen && (
          <EmojiPicker
            onEmojiSelect={(e) => composerRef.current?.insert(e)}
            recentEmojis={recentEmojis}
            onAddRecent={handleAddRecent}
          />
        )}
      </KeyboardAvoidingView>
      <MessageActionSheet
        visible={showActions && selectedMsgsData.length > 0}
        preview={selectedMsgsData.length === 1
          ? { ...messagePreview(selectedMsgsData[0]), time: timeAgo(selectedMsgsData[0].timestamp), mine: selectedMsgsData[0].senderId === username }
          : { icon: "checkmark-done-outline", text: `${selectedMsgsData.length} messages selected`, mine: true }}
        actions={showActions ? messageActions(selectedMsgsData, isActiveMember && roomInfo?.exited != 1) : []}
        onClose={() => closeActions()}
      />
      <DeleteMessageModal
        visible={showDeleteModal}
        count={selectedMsgs.length}
        // Received messages can only be removed from your own device
        allowEveryone={selectedMsgsData.length > 0 && selectedMsgsData.every((m: any) => m.senderId === username)}
        onClose={() => {
          setShowDeleteModal(false);
          clearSelection();
        }}
        onDeleteForEveryone={() => {
          handleDeleteSelected("everyone");
          setShowDeleteModal(false);
        }}
        onDeleteForMe={() => {
          handleDeleteSelected("me");
          setShowDeleteModal(false);
        }}
      />
      <LocationPickerModal
        visible={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onSend={sendLocation}
      />
      <MediaPreviewModal
        visible={showPreview}
        items={pendingMedia}
        captions={captions}
        onChangeCaption={(i, t) => setCaptions((prev) => { const next = [...prev]; next[i] = t; return next; })}
        onRemove={(i) => {
          setPendingMedia((prev) => prev.filter((_, j) => j !== i));
          setCaptions((prev) => prev.filter((_, j) => j !== i));
        }}
        onClose={() => { setShowPreview(false); setPendingMedia([]); setCaptions([]); }}
        onSend={sendMedia}
      />
    </SafeAreaView >
  );
}