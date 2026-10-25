import { currentScreen } from "@/app/_layout";
import { clearTurnCredentials, refreshTurnCredentials } from "@/utils/turn";
import { decryptIncomingEdit, decryptIncomingMessage, handleGroupKeyPacket, handleResendRequest, initKey, rotateGroupKey } from "@/utils/e2ee";
import { registerGroupVideoCallHandlers } from "@/contexts/groupVideoCallService";
import { registerVideoCallHandlers } from "@/contexts/videoCallController";
import { updateAudioStatus } from "@/db/callsRepo";
import { clearUnreadMessages, convBlockMember, convUnblockMember, getUnreadMessageData, leaveGroupByID, removeGroupMembers, saveConversation, setDisappearingMessages, updateConversationLastMessage, updateConversationLastMessageText, updateGroupAdmin, updateGroupMembers, updateGroupProfileName } from "@/db/conversationRepo";
import { enqueueDbWrite } from "@/db/dbQueue";
import { clearDestructingMessages, clearDisappearingMessages, deleteMessageById, saveMessage, updateMessageData, updateMessageReactions, updateMessageStatus } from "@/db/messageRepo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from 'expo-router';
import { io, Socket } from "socket.io-client";
import { AuthAPI, CHATAPI } from "./api";
import { setGlobalDbTick, setGlobalIsSocketConnected, setGlobalNewLogin, setGlobalSocket, setGlobalUsername } from "./globalRefs";

let socket: Socket;

const initSocket = async () => {
  const token = await AsyncStorage.getItem("token");
    // socket = io("http://192.168.1.5:4022", {
    socket = io("wss://lets-chat-conversation-socket.up.railway.app", {
    transports: ["websocket"],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    forceNew: false,
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error);
  });

  return socket;
};

// Initialize socket connection
export const getSocket = async () => {
  if (!socket) {
    return await initSocket();
  }
  return socket;
};

export const logout = async () => {
  try {
    // Ends this device's session server-side (its push tokens go with it)
    await AuthAPI.post("/auth/logout");
  } catch (err) {
    // Already ended (e.g. signed out by a login on another device) or offline: still log out locally
    console.info("logout request failed", err);
  }
  await AsyncStorage.multiRemove(["token", "refreshToken", "userHandle"]);
  await clearTurnCredentials();
  if (router.canDismiss()) router.dismissAll(); // nothing to dismiss when already at the first screen
  router.navigate('/screens/login');
};

const offSocketEvent = async (socket: Socket) => {
  [
    "chat:recv-message",
    "chat:otherCreateConversation",
    "chat:messageStatusUpdate",
    "chat:msgReaction",
    "chat:deleteMessages",
    "chat:updateDisappearingMessages",
    "chat:disappearingMessages",
    "chat:destructingMessages",
    "chat:blockUser",
    "chat:updateGroupProfileName",
    "chat:updateConversationMembers",
    "chat:removeConversationMembers",
    "chat:updateGroupAdmins",
    "chat:leaveConversationMembers",
    "call:audioVideoStatusUpdate",
    "chat:updateNewLogin",
    "chat:group-info-private",
    "chat:updateContactsList",
    "chat:resend-request"
  ].forEach((sock) => {
    socket.off(sock);
  })
}

const socketEvents = async (socket: Socket) => {
  await offSocketEvent(socket);
  const storedUsername = String(await AsyncStorage.getItem("username")) || "";
  socket?.on("chat:recv-message", async (msg: any, ack: Function) => {
    enqueueDbWrite(async () => {
      await decryptIncomingMessage(msg, storedUsername);
      if (msg.senderId != storedUsername || msg.messageType == "money") {
        await updateConversationLastMessage({
          id: msg.conversationId,
          unreadMsg: msg.messageId,
          lastMessageId: msg.messageId,
          lastMessage: msg.messageType === "location" ? "📍 Location" : msg.messageType === "contact" ? `👤 ${(typeof msg.content === "object" ? msg.content : JSON.parse(msg.content || "{}"))?.name || "Contact"}` : typeof msg.content === 'object' ? msg.content?.msg || msg.messageType : JSON.parse(msg.content)?.msg || msg.messageType,
          lastMessageType: msg.messageType,
          lastMessageSenderId: msg.senderId,
          lastMessageStatus: "delivered",
          lastMessageDate: new Date().toISOString(),
        }, storedUsername);
        await saveMessage({
          ...msg,
          timestamp: new Date().toISOString(),
          status: "delivered",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        if (currentScreen == 'screens/room') {
          const unreadData: any = await getUnreadMessageData(msg.conversationId as string) || "[]";
          let unreadMsgTemp: any = JSON.parse(typeof unreadData?.unreadMsg === 'string' ? unreadData.unreadMsg : '[]');
          if (unreadMsgTemp) {
            socket?.emit("chat:markAsRead", { messageIds: unreadMsgTemp, conversationId: msg.conversationId, username: storedUsername, timestamp: new Date().toISOString() });
            await clearUnreadMessages(msg.conversationId as string);
            setGlobalDbTick();
          }
        }
        else {
          socket?.emit("chat:markAsDelivered", {
            messageIds: [msg.messageId],
            conversationId: msg.conversationId,
            username: storedUsername,
            timestamp: new Date().toISOString()
          });
        }
        setGlobalDbTick();
      }
    });
    if (ack) ack("received");
  });
  socket?.on("chat:editMessage", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      if (!(await decryptIncomingEdit(data, storedUsername))) return;

      await updateMessageData(data);
      await updateConversationLastMessageText(data.conversationId, data.newMessage);
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("chat:otherCreateConversation", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      let conv = data.conv;
      await saveConversation(conv);
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("chat:messageStatusUpdate", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      await updateMessageStatus(data.conversationId, data.messageId, data.updatedStatus, data.username, data.timestamp);
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("chat:msgReaction", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      if (!data || typeof data !== "object") {
        console.error("Invalid chat:msgReaction payload:", data);
        return;
      }
      const { conversationId, messageId } = data;
      const hasReactionState =
        Object.prototype.hasOwnProperty.call(data, "reactions") ||
        Object.prototype.hasOwnProperty.call(data, "messageReactions") ||
        Object.prototype.hasOwnProperty.call(data, "reaction");
      const reactions = Object.prototype.hasOwnProperty.call(data, "reactions")
        ? data.reactions
        : Object.prototype.hasOwnProperty.call(data, "messageReactions")
          ? data.messageReactions
          : data.reaction;
      if (!conversationId || !messageId || !hasReactionState) {
        console.error("Invalid chat:msgReaction payload:", data);
        return;
      }
      await updateMessageReactions(conversationId, messageId, reactions);
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("chat:deleteMessages", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      const { conversationId, messageIds } = data;
      await deleteMessageById(conversationId, messageIds);
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("chat:updateDisappearingMessages", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      const { conversationId, duration } = data;
      await setDisappearingMessages(conversationId, duration);
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("chat:disappearingMessages", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      const { conversationId } = data;
      await clearDisappearingMessages(conversationId);
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("chat:destructingMessages", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      const { conversationId, sernderId, timestamp } = data;
      await clearDestructingMessages(conversationId, sernderId, timestamp);
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("chat:blockUser", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      const { conversationId, hitBy, type } = data;
      if (type === "block") {
        await convBlockMember(conversationId, hitBy);
      } else if (type === "unblock") {
        await convUnblockMember(conversationId, hitBy);
      }
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("chat:updateGroupProfileName", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      const { conversationId, name, avatar } = data;
      await updateGroupProfileName(conversationId, name, avatar);
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("chat:updateConversationMembers", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      const { conversationId, members, removedMembers } = data;
      if (removedMembers?.length) await rotateGroupKey(conversationId);
      await updateGroupMembers(conversationId, members, removedMembers);
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("chat:removeConversationMembers", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      const { conversationId, members, removedMember } = data;
      await rotateGroupKey(conversationId);
      await removeGroupMembers(conversationId, members, removedMember);
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("chat:updateGroupAdmins", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      const { conversationId, admins } = data;
      await updateGroupAdmin(conversationId, admins);
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("chat:leaveConversationMembers", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      const { conversationId, member } = data;
      await rotateGroupKey(conversationId);
      await leaveGroupByID(conversationId, member);
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("call:audioVideoStatusUpdate", (data: any, ack: Function) => {
    enqueueDbWrite(async () => {
      await updateAudioStatus(data);
      setGlobalDbTick();
    });
    if (ack) ack("received");
  });
  socket?.on("chat:updateNewLogin", async (data: any, ack: Function) => {
    if (ack) ack("received");
    if (data.logout == false) {
      setGlobalNewLogin({ show: true, logout: data.logout });
    }
    else {
      // data.deviceId is the device that just logged in; every other device signs out
      const deviceId = await AsyncStorage.getItem("deviceId");
      if (data.deviceId != deviceId) {
        setGlobalNewLogin({ show: false, logout: data.logout });
        logout();
      }
    }
  });
  socket?.on("chat:send-group-key", async (msg: any, ack: Function) => {
    try {
      await handleGroupKeyPacket(msg.senderId, msg.content);
      if (ack) ack("received");
    } catch (error) {
      console.info("Error processing group key:", error);
      if (ack) ack("received");
    }
  });
  // Undecryptable messages: a peer asks us to resend, or answers our request (see utils/e2ee).
  socket?.on("chat:resend-request", (payload: any, ack: Function) => {
    enqueueDbWrite(async () => {
      try {
        await handleResendRequest(payload, storedUsername);
      } catch (error) {
        console.info("Error processing resend request:", error);
      }
    });
    if (ack) ack("received");
  });
  socket.on("chat:requestGroupKey", async (payload, ack) => {
    // Sender keys are only ever shared member-to-member over 1:1 sessions, never with the server.
    ack({
      senderId: storedUsername,
      key: null,
    });
  });
  socket.on("chat:updateContactsList", async (payload, ack) => {
    const { phone } = payload;
    const storeContacts = JSON.parse(await AsyncStorage.getItem("contactsFriend") || "[]");
    const data = storeContacts.filter((contat: any) => String(contat.phone) == String(phone));
    let contactData = data[0];
    const res = await CHATAPI.post("/contacts/my-contacts", {
      phonesWithNames: [{
        "name": contactData.name,
        "phone": phone
      }],
    });
    const updated = storeContacts.map((item: any) => {
      const fresh = res.data.find((u: any) => u.phone === item.phone);
      return fresh ? fresh : item;
    });
    await AsyncStorage.setItem("contactsFriend", JSON.stringify(updated));
    setGlobalDbTick();
    if (ack) ack("received");
  });
  socket?.emit("registerUser", { senderId: storedUsername });
}

export const initializeSocket = async () => {
  const token = await AsyncStorage.getItem("token");
  if (!token) {
    return null;
  }
  // Have TURN credentials ready for calls (in the background, doesn't hold up the socket)
  refreshTurnCredentials().catch(() => undefined);
  try {
    const socketInstance = await getSocket();
    if (!socketInstance) {
      return null;
    }

    const username = String(await AsyncStorage.getItem("username")) || "";
    setGlobalSocket(socketInstance);
    setGlobalUsername(username);
    // Users logged in before the e2e-crypto upgrade get their keys here.
    initKey().catch((err) => console.info("e2ee initKey failed", err));

    const handleConnect = async () => {
      await socketEvents(socketInstance);
      registerVideoCallHandlers(socketInstance!, username);
      registerGroupVideoCallHandlers(socketInstance!, username);
      console.info('Socket connected.');
      setGlobalIsSocketConnected(true);
    };

    socketInstance.off('connect');
    socketInstance.off('disconnect');

    socketInstance.on('connect', handleConnect);
    socketInstance.on('disconnect', (reason) => {
      console.info('Socket disconnected', reason);
      offSocketEvent(socketInstance);
      setGlobalIsSocketConnected(false);
      if (reason === "io server disconnect") {
        socketInstance?.connect();
      }
    });

    if (socketInstance.connected) {
      await handleConnect();
    }

    return socketInstance;
  } catch (error) {
    console.error('Socket initialization error:', error);
    return null;
  }
};

export const offlineMsgStoreApi = async (username: string) => {
  let offlineMessages = await CHATAPI.get("/chats/getOfflineMessages");
  try {
    if (offlineMessages.data && Array.isArray(offlineMessages.data)) {
      for (const msg of offlineMessages.data.reverse()) {
        if (msg.type == "createConversation") {
          let conv = msg.data.conv;
          await saveConversation(conv);
          setGlobalDbTick();
        }
        if (msg.type == "chatMessageStatus") {
          await updateMessageStatus(msg.data.conversationId, msg.data.messageId, msg.data.updatedStatus, msg.data.username, msg.data.timestamp);
          setGlobalDbTick();
        }
        if (msg.type == "chatDeleteMessages") {
          const { conversationId, messageIds } = msg.data;
          await deleteMessageById(conversationId, messageIds);
          setGlobalDbTick();
        }
        if (msg.type == "chatEditMessage") {
          if (await decryptIncomingEdit(msg.data, username)) {
            await updateMessageData(msg.data);
            await updateConversationLastMessageText(msg.data.conversationId, msg.data.newMessage.msg);
            setGlobalDbTick();
          }
        }
        if (msg.type == "updateDisappearingMessages") {
          const { conversationId, duration } = msg.data;
          await setDisappearingMessages(conversationId, duration);
          setGlobalDbTick();
        }
        if (msg.type == "disappearingMessages") {
          const { conversationId } = msg.data;
          await clearDisappearingMessages(conversationId);
        }
        if (msg.type == "destructingMessages") {
          const { conversationId, senderId, timestamp } = msg.data;
          await clearDestructingMessages(conversationId, senderId, timestamp);
          setGlobalDbTick();
        }
        if (msg.type == "blockUser") {
          const { conversationId, hitBy, type } = msg.data;
          if (type === "block") {
            await convBlockMember(conversationId, hitBy);
          } else if (type === "unblock") {
            await convUnblockMember(conversationId, hitBy);
          }
          setGlobalDbTick();
        }
        if (msg.type == "updateGroupProfileName") {
          const { conversationId, name, avatar } = msg.data;
          await updateGroupProfileName(conversationId, name, avatar);
          setGlobalDbTick();
        }
        if (msg.type == "updateConversationMembers") {
          const { conversationId, members, removedMembers } = msg.data;
          if (removedMembers?.length) await rotateGroupKey(conversationId);
          await updateGroupMembers(conversationId, members, removedMembers);
          setGlobalDbTick();
        }
        if (msg.type == "removeConversationMembers") {
          const { conversationId, members, removedMember } = msg.data;
          await rotateGroupKey(conversationId);
          await removeGroupMembers(conversationId, members, removedMember);
          setGlobalDbTick();
        }
        if (msg.type == "updateGroupAdmins") {
          const { conversationId, admins } = msg.data;
          await updateGroupAdmin(conversationId, admins);
          setGlobalDbTick();
        }
        if (msg.type == "leaveConversationMembers") {
          const { conversationId, member } = msg.data;
          await rotateGroupKey(conversationId);
          await leaveGroupByID(conversationId, member);
          setGlobalDbTick();
        }
        if (msg.type == "audioVideoStatusUpdate") {
          await updateAudioStatus(msg.data);
          setGlobalDbTick();
        }
        if (msg.type == "updateNewLogin") {
          if (msg.data.logout == false) {
            setGlobalNewLogin({ show: true, logout: msg.data.logout });
          }
          else if (msg.data.deviceId != await AsyncStorage.getItem("deviceId")) {
            setGlobalNewLogin({ show: false, logout: msg.data.logout });
            logout();
          }
        }
        if (msg.type == "groupKeyChat") {
          try {
            await handleGroupKeyPacket(msg.data.senderId, msg.data.content);
          } catch (error) {
            console.info("Error processing group key:", error);
          }
        }
        if (msg.type == "resendRequest") {
          try {
            await handleResendRequest(msg.data, username);
          } catch (error) {
            console.info("Error processing resend request:", error);
          }
        }
        if (msg.type == "chatMessage") {
          // Offline items are wrappers: { type, data } — the message is msg.data.
          const m = msg.data;
          try {
          await decryptIncomingMessage(m, username);
          if (m.messageType == "group_create" && typeof m.content === "string") {
            m.content = JSON.parse(m.content);
          }
          if (m.senderId != username || m.messageType == "money") {
            let lastText = m.messageType;
            try {
              const c = typeof m.content === 'object' ? m.content : JSON.parse(m.content);
              lastText = c?.msg || m.messageType;
            } catch { }
            await updateConversationLastMessage({
              id: m.conversationId,
              unreadMsg: m.messageId,
              lastMessageId: m.messageId,
              lastMessage: lastText,
              lastMessageType: m.messageType,
              lastMessageSenderId: m.senderId,
              lastMessageStatus: "delivered",
              lastMessageDate: new Date().toISOString(),
            }, username);
            await saveMessage({
              ...m,
              timestamp: m.timestamp ?? new Date().toISOString(),
              status: "delivered",
              createdAt: m.createdAt ?? new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            if (currentScreen == 'screens/room') {
              const unreadData: any = await getUnreadMessageData(m.conversationId as string) || "[]";
              let unreadMsgTemp: any = JSON.parse(typeof unreadData?.unreadMsg === 'string' ? unreadData.unreadMsg : '[]');
              if (unreadMsgTemp) {
                socket?.emit("chat:markAsRead", { messageIds: unreadMsgTemp, conversationId: msg.data.conversationId, username: username, timestamp: new Date().toISOString() });
                await clearUnreadMessages(msg.data.conversationId as string);
                setGlobalDbTick();
              }
            }
            else {
              socket?.emit("chat:markAsDelivered", {
                messageIds: [msg.data.messageId],
                conversationId: msg.data.conversationId,
                username: username,
                timestamp: new Date().toISOString()
              });
            }
            setGlobalDbTick();
          }
          } catch (err) {
            // One bad item must not abort the whole sync.
            console.info("offline message failed", m?.messageId, err);
          }
        }
      };
      // Clear once, after every item has been processed (it used to run after the first one).
      await CHATAPI.get("/chats/clearOfflineMessages");
    }
  } catch (err) {
    console.error("Error fetching offline messages:", err);
  }
}

export const restorePreviousConversations = async () => {
  let conversations;
  try {
    conversations = await CHATAPI.get("/chats/getGroupConversation");
  } catch (err) {
    // Only a sync step: don't let it block login. Older servers answer 404 when there are no groups.
    console.info("restore group conversations failed", err);
    return;
  }
  const convList = conversations?.data?.conv;
  if (Array.isArray(convList)) {
    // Profiles of group members, so non-contacts can be shown by name.
    const profiles: Record<string, any> = {};
    const addProfile = (u: any) => { if (u?.phone) profiles[String(u.phone)] = u; };
    (conversations.data.users ?? []).forEach(addProfile);
    // Members may come back as user objects; the DB stores phone numbers only.
    const toPhones = (list: any[] = []) => list.map((m: any) => {
      if (m && typeof m === "object") { addProfile(m); return String(m.phone); }
      return m;
    });
    for (const conv of convList) {
      await saveConversation({ ...conv, members: toPhones(conv.members), removedMembers: toPhones(conv.removedMembers) });
    }
    await AsyncStorage.setItem("groupMemberProfiles", JSON.stringify(Object.values(profiles)));
    setGlobalDbTick();
  }
}
