import BottomSheet from "@/app/components/BottomSheet";
import UserCallBox from "@/app/components/UserCallBox";
import { styles } from "@/app/styles";
import { acceptCall, addToCall, endCall, peerConnection, resetAllCallState, upgradeToVideo } from "@/contexts/CallController";
import { AudioCallEvents, ConsumerEntry, endGroupCall, getAudioGroupConsumers, groupToggleMute } from "@/contexts/groupCallService";
import { getConversationById } from "@/db/conversationRepo";
import { getGlobalSocket, getGlobalUsername } from "@/utils/globalRefs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Button, FlatList, Image, PermissionsAndroid, Platform, Text, TouchableOpacity, View } from "react-native";
import { default as inCallManager, default as InCallManager } from "react-native-incall-manager";

export default function InCallScreen() {
  const socket = getGlobalSocket();
  const username = getGlobalUsername();
  const { conversationId, from, callType, to } = useLocalSearchParams();
  const [callDuration, setCallDuration] = useState(0);
  const [convInfo, setConvInfo] = useState<any>({});
  const [openContact, setOpenContact] = useState(false);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [consumers, setConsumers] = useState<ConsumerEntry[]>([]);
  const [speakingUsers, setSpeakingUsers] = useState<any[]>([]);
  const [mutedUsers, setMutedUsers] = useState<Record<string, boolean>>({});

  async function ensureMicrophonePermission(): Promise<boolean> {
    if (Platform.OS === "android") {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: "Microphone permission",
            message: "App needs access to your microphone for calls",
            buttonPositive: "OK",
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (e) {
        console.warn("PermissionsAndroid error", e);
        return false;
      }
    }
    return true;
  }

  const toggleSpeaker = async () => {
    try {
      setIsSpeakerOn((prev) => {
        InCallManager.setSpeakerphoneOn(!prev);
        return !prev
      });
    } catch (e) {
      console.warn('toggleSpeaker failed', e);
    }
  };

  const setGroupCallMute = async () => {
    try {
      let getMute = groupToggleMute();
      socket?.emit("userMuteState", { conversationId, userId: username, muted: getMute });
    } catch (e) {
      console.warn('toggleMute failed', e);
    }
  };

  useEffect(() => {
    setConsumers(getAudioGroupConsumers());
    const subscription = AudioCallEvents.addListener("group-audio-update-consumers",
      (updatedPeers) => {
        setConsumers([...updatedPeers]);
      }
    );
    const s1 = AudioCallEvents.addListener("group-audio-speaking-changed",
      (speakers) => {
        setSpeakingUsers(speakers);
      }
    );

    const s2 = AudioCallEvents.addListener("group-audio-mute-changed",
      ({ userId, muted }: { userId: string; muted: boolean }) => {
        setMutedUsers((prev) => ({ ...prev, [userId]: muted }));
      }
    );

    (async () => {
      const convData = await getConversationById(conversationId as string);
      setConvInfo(convData ?? {});
      if (callType == 'incomingCall') {
        startTimmer();
        await acceptCall(socket!, username!);
      }
      let contacts = JSON.parse(await AsyncStorage.getItem("contactsFriend") || "[]");
      setContacts(contacts)

      const ok = await ensureMicrophonePermission();
      if (!ok) {
        console.warn("Microphone permission denied");
        throw new Error("Microphone permission denied");
      }
    })()

    socket?.on("call:connected", ({ callId }) => {
      startTimmer();
    });

    return () => {
      socket?.off("userMuteState");
      socket?.off("call:connected");
      clearTimmer();
      resetAllCallState();
      subscription.remove();
      s1.remove();
      s2.remove();
      // setOnConsumersChanged(() => { });
    }
  }, []);

  const toggleSelectUser = (user: any) => {
    setSelectedUsers((prev) => {
      const exists = prev.find((u) => u.phone === user.phone);
      if (exists) {
        return prev.filter((u) => u.phone !== user.phone);
      } else {
        return [...prev, user];
      }
    });
  };

  const startTimmer = () => {
    interval.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
  }

  const clearTimmer = () => {
    clearInterval(interval.current!);
  }

  const formatDuration = (seconds: any) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleEndGroupCall = () => {
    inCallManager.stopRingtone();
    endGroupCall(socket!, username!);
  }

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={["#141e30", "#243b55"]} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {callType != "groupCall" && <TouchableOpacity
          onPress={() => setOpenContact(true)}
          style={styles.addUserInCall}
        >
          <Text style={styles.addUserPlus}>+</Text>
        </TouchableOpacity>}
        {
          convInfo?.type == "single" && peerConnection && Object.keys(peerConnection).length < 2 ?
            <View style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Image source={{ uri: convInfo?.type == "group" ? convInfo?.avatar : "https://randomuser.me/api/portraits/men/75.jpg" }} style={{ width: 150, height: 150, borderRadius: 75, marginBottom: 20 }} />
              <Text style={{ color: "#fff", fontSize: 28, fontWeight: "700" }}>{convInfo?.type == "group" ? convInfo?.name : Object.keys(peerConnection)[0]}</Text>
              <Text style={{ color: "#a0a0a0", fontSize: 18, marginTop: 6 }}>{formatDuration(callDuration)}</Text>
            </View> :
            Object.keys(peerConnection).length ? <View style={{ flex: 1, width: "100%" }}>
              <UserCallBox
                users={
                  Object.keys(peerConnection).map((peer: any, index: number) => {
                    return ({ name: peer, avatar: `https://i.pravatar.cc/150?img=${index}` })
                  })
                }
              />
            </View> : null
        }
        {
          convInfo?.type == "group" && consumers && consumers.length < 1 ?
            <View style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Image source={{ uri: convInfo?.type == "group" ? convInfo?.avatar : "https://randomuser.me/api/portraits/men/75.jpg" }} style={{ width: 150, height: 150, borderRadius: 75, marginBottom: 20 }} />
              <Text style={{ color: "#fff", fontSize: 28, fontWeight: "700" }}>{convInfo?.type == "group" ? convInfo?.name : Object.keys(peerConnection)[0]}</Text>
              <Text style={{ color: "#a0a0a0", fontSize: 18, marginTop: 6 }}>{formatDuration(callDuration)}</Text>
            </View> :
            consumers.length ? <View style={{ flex: 1, width: "100%" }}>
              <UserCallBox
                users={
                  consumers.map((peer: any, index: number) => {
                    return ({ name: peer.userId, avatar: `https://i.pravatar.cc/150?img=${index}` })
                  })
                }
                speakingUsers={speakingUsers}
                mutedUsers={mutedUsers}
              />
            </View> : null
        }
        <View style={{ flexDirection: "row", justifyContent: "space-around", width: "80%", position: "absolute", bottom: 100 }}>
          <TouchableOpacity style={{ alignItems: "center" }} onPress={() => { callType == "groupCall" && setGroupCallMute() }}>
            <Image source={{ uri: "https://cdn-icons-png.flaticon.com/512/565/565296.png" }} style={{ width: 50, height: 50, tintColor: "#fff" }} />
            <Text style={{ color: "#fff", marginTop: 6 }}>Mute</Text>
          </TouchableOpacity>

          <TouchableOpacity style={{ alignItems: "center" }} onPress={() => toggleSpeaker()}>
            <Image
              source={isSpeakerOn
                ? require("../../../assets/images/volume.png")
                : require("../../../assets/images/mute.png")
              }
              style={{ width: 50, height: 50, tintColor: "#fff" }}
            />
            <Text style={{ color: "#fff", marginTop: 6 }}>{isSpeakerOn ? 'Speaker On' : 'Speaker Off'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={{ alignItems: "center" }} onPress={async () => {
            try {
              const peers = Object.keys(peerConnection);
              if (!peers.length) return console.warn('No peers to upgrade');
              await upgradeToVideo(socket!, username!, username == to as string ? from as string : to as string, conversationId! as string);
            } catch (e) {
              console.warn('upgrade to video failed', e);
            }
          }}>
            <Image source={{ uri: "https://cdn-icons-png.flaticon.com/512/727/727245.png" }} style={{ width: 50, height: 50, tintColor: "#fff" }} />
            <Text style={{ color: "#fff", marginTop: 6 }}>Video</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { callType == "groupCall" ? handleEndGroupCall() : endCall(socket!, username!, conversationId as string) }} style={{ alignItems: "center" }}>
            <View style={{ backgroundColor: "#f44336", width: 50, height: 50, borderRadius: 35, alignItems: "center", justifyContent: "center" }}>
              <Image source={{ uri: "https://cdn-icons-png.flaticon.com/512/1828/1828843.png" }} style={{ width: 30, height: 30, tintColor: "#fff" }} />
            </View>
            <Text style={{ color: "#fff", marginTop: 6 }}>End</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
      {callType != "groupCall" && <BottomSheet visible={openContact} onClose={() => setOpenContact(false)} sheetHeight={550}>
        <Text style={{ fontSize: 20, fontWeight: "bold" }}>Add Users</Text>
        <FlatList
          data={contacts}
          keyExtractor={(item, i) => i.toString()}
          renderItem={({ item }: { item: any }) => (
            <TouchableOpacity
              style={styles.contactItemBottomSheet}
              onPress={() => toggleSelectUser(item)}
            >
              <Image
                source={{
                  uri: item.profile_image ? item.profile_image : `https://ui-avatars.com/api/?name=${item.name || item.phone}&background=25d366&color=fff`,
                }}
                style={styles.contactAvatarBottomSheet}
              />
              <View>
                <Text style={styles.contactNameBottomSheet}>{item.name || item.phone}</Text>
                <Text style={styles.contactSubTextBottomSheet}>{item.phone}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
        {selectedUsers.length > 0 && (
          <View style={{ marginTop: 10, marginBottom: 15 }}>
            <FlatList
              horizontal
              data={selectedUsers}
              keyExtractor={(item) => item.phone}
              renderItem={({ item }) => (
                <View style={styles.contactSelectedUserContainerBottomSheet}>
                  <Image
                    source={{
                      uri: item.profile_image
                        ? item.profile_image
                        : `https://ui-avatars.com/api/?name=${item.name || item.phone}&background=25d366&color=fff`,
                    }}
                    style={styles.contactSelectedUserAvatarBottomSheet}
                  />

                  <Text style={styles.contactSelectedUserNameBottomSheet} numberOfLines={1}>
                    {item.name || item.phone}
                  </Text>

                  <TouchableOpacity onPress={() => toggleSelectUser(item)} style={styles.contactRemoveBtnBottomSheet}>
                    <Text style={{ color: "#fff", fontSize: 12 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
        )}
        <View style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {selectedUsers.length > 0 && <Button color={'primary'} title="Add to call" onPress={() => { setOpenContact(false); addToCall(socket!, selectedUsers, username!) }} />}
          <Button title="Close" onPress={() => setOpenContact(false)} />
        </View>
      </BottomSheet>}
    </View >
  );
}
