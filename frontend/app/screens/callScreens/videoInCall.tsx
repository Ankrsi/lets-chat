import BottomSheet from "@/app/components/BottomSheet";
import UserVideoCallBox from "@/app/components/UserVideoCallBox";
import { styles } from "@/app/styles";
import {
  endVideoGroupCall,
  getVideoGroupConsumers,
  groupVideoLocalStream,
  VideoCallEvents,
  videoGroupCallConsumers,
  videoToggleAudio,
  videoToggleCamera,
  switchCallType as switchGroupCallType,
} from "@/contexts/groupVideoCallService";
import {
  addUserVideoCall,
  CallEvents,
  leaveVideoCall,
  localStream,
  peerConnection,
  switchCallType,
} from "@/contexts/videoCallController";
import { getGlobalSocket, getGlobalUsername } from "@/utils/globalRefs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { Button, FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import InCallManager from "react-native-incall-manager";
import { RTCView } from "react-native-webrtc";

export default function videoInCall() {
  const socket = getGlobalSocket();
  const username = getGlobalUsername();
  const { conversationId, callType, to } = useLocalSearchParams();
  const [openContact, setOpenContact] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<any[]>([]);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
  const [consumers, setConsumers] = useState<any[]>([]);
  const [speakingUsers, setSpeakingUsers] = useState<any[]>([]);
  const [mutedUsers, setMutedUsers] = useState<Record<string, boolean>>({});

  const isGroup = callType === "groupCall";

  // Reactive call type: starts from the route param but updates live when the
  // call is switched audio <-> video. For 1-1 the controller emits
  // "call-type-changed"; for group the service emits
  // "group-video-calltype-changed".
  const [activeCallType, setActiveCallType] = useState<"audio" | "video">(
    callType === "audio" ? "audio" : "video"
  );
  const isAudio = activeCallType === "audio";

  useEffect(() => {
    setConsumers(getVideoGroupConsumers());
    const s1 = VideoCallEvents.addListener("group-video-speaking-changed",
      (speakers) => {
        setSpeakingUsers(speakers);
      }
    );
    const s2 = VideoCallEvents.addListener("group-video-mute-changed",
      ({ userId, muted }: { userId: string; muted: boolean }) => {
        setMutedUsers((prev) => ({ ...prev, [userId]: muted }));
      }
    );
    // flip the layout when a 1-1 call switches audio <-> video
    const s3 = CallEvents.addListener("call-type-changed", (type: "audio" | "video") => {
      setActiveCallType(type);
    });
    // flip the layout when a GROUP call switches audio <-> video
    const s4 = VideoCallEvents.addListener("group-video-calltype-changed",
      ({ callType: nextType }: { userId: string; callType: "audio" | "video" }) => {
        setActiveCallType(nextType);
      }
    );
    (async () => {
      let contacts = JSON.parse(await AsyncStorage.getItem("contactsFriend") || "[]");
      setContacts(contacts)
    })()

    let interval: any = null;
    if (isGroup) {
      interval = setInterval(() => {
        setConsumers([...videoGroupCallConsumers]);
      }, 400);
    }
    else {
      interval = setInterval(() => {
        const streams = Object.values(peerConnection)
          .map((peer: any) => peer.remoteStream)
          .filter(Boolean);
        setRemoteStreams(streams);
      }, 400);
    }

    return () => {
      clearInterval(interval);
      s1.remove();
      s2.remove();
      s3.remove();
      s4.remove();
    }
  }, []);

  const endCall = () => {
    if (isGroup) {
      endVideoGroupCall(socket!, username!);
    }
    else {
      leaveVideoCall(socket!, username!, conversationId as string);
    }
  };

  const muteAudioCall = () => {
    if (isGroup) {
      videoToggleAudio();
    }
    else {
      console.warn("Audio toggle not implemented for 1-1 calls yet");
    }
  };

  // Route the switch to the correct controller (group vs 1-1)
  const handleSwitchCallType = () => {
    const next = isAudio ? "video" : "audio";
    if (isGroup) {
      switchGroupCallType(socket!, username!, next);
    } else {
      switchCallType(socket!, username!, next);
    }
  };

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

  return (
    <View style={styles.container}>

      {/* Remote Videos — video call only */}
      {!isAudio && remoteStreams?.length > 0 && remoteStreams?.map((stream: any, index: number) => (
        <RTCView
          key={stream.id || stream._id || `stream-${index}`}
          streamURL={stream?.toURL()}
          style={styles.videoCallRemote}
          objectFit="cover"
          zOrder={0}
        />
      ))}

      {/* Group call consumers */}
      {consumers.length > 0 &&
        <UserVideoCallBox
          users={
            consumers?.map((stream: any) => {
              return ({ name: stream.userId, stream })
            })
          }
          speakingUsers={speakingUsers}
          mutedUsers={mutedUsers}
          isAudio={isAudio}
        />
      }

      {/* Local Video — video call only */}
      {!isAudio && localStream && (
        <RTCView
          streamURL={localStream?.toURL()}
          style={styles.videoCallLocal}
          objectFit="cover"
          zOrder={1}
        />
      )}

      {/* Local GROUP video — only when actually a video call */}
      {!isAudio && groupVideoLocalStream && (
        <RTCView
          streamURL={groupVideoLocalStream?.toURL()}
          style={styles.videoCallLocal}
          objectFit="cover"
          zOrder={1}
        />
      )}

      {/* Audio call avatar — shown instead of video */}
      {isAudio && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Image
            source={{ uri: `https://ui-avatars.com/api/?name=${username}&background=25d366&color=fff&size=128` }}
            style={{ width: 100, height: 100, borderRadius: 50, marginBottom: 16 }}
          />
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "600" }}>{to}</Text>
          <Text style={{ color: "#aaa", fontSize: 14, marginTop: 6 }}>
            {(isGroup ? consumers.length > 0 : remoteStreams.length > 0) ? "Connected" : "Calling..."}
          </Text>
        </View>
      )}

      {/* Add user button */}
      {!isGroup && (
        <TouchableOpacity
          onPress={() => { setOpenContact(true) }}
          style={styles.addUserInCall}
        >
          <Text style={styles.addUserPlus}>+</Text>
        </TouchableOpacity>
      )}

      {/* Call Controls */}
      <View style={{ flexDirection: "row", justifyContent: "center", width: "100%", position: "absolute", bottom: 100, gap: 25, alignContent: "center" }}>

        <TouchableOpacity style={{ alignItems: "center" }} onPress={() => muteAudioCall()}>
          <MaterialCommunityIcons name={"microphone-off"} size={40} color="#FFFFFF" />
          <Text style={{ color: "#fff", marginTop: 6 }}>Mute</Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ alignItems: "center" }} onPress={() => toggleSpeaker()}>
          <MaterialCommunityIcons name={isSpeakerOn ? "volume-high" : "volume-off"} size={40} color="#FFFFFF" />
          <Text style={{ color: "#fff", marginTop: 6 }}>{isSpeakerOn ? 'Speaker On' : 'Speaker Off'}</Text>
        </TouchableOpacity>

        {/* Switch audio <-> video — works for both group and 1-1 */}
        <TouchableOpacity
          style={{ alignItems: "center" }}
          onPress={handleSwitchCallType}
        >
          <MaterialCommunityIcons name={isAudio ? "video" : "cast-audio"} size={40} color="#FFFFFF" />
          <Text style={{ color: "#fff", marginTop: 6 }}>{isAudio ? "Video" : "Audio"}</Text>
        </TouchableOpacity>

        {/* Camera toggle — video call only */}
        {!isAudio && (
          <TouchableOpacity onPress={videoToggleCamera} style={{ alignItems: "center" }}>
            <MaterialCommunityIcons name={"camera"} size={40} color="#FFFFFF" />
            <Text style={{ color: "#fff", marginTop: 6 }}>Camera</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={endCall} style={{ alignItems: "center" }}>
          <MaterialCommunityIcons name={"radiobox-marked"} size={40} color="#ff3f3f" />
          <Text style={{ color: "#fff", marginTop: 6 }}>End</Text>
        </TouchableOpacity>
      </View>

      {/* Add user bottom sheet */}
      {!isGroup && (
        <BottomSheet visible={openContact} onClose={() => setOpenContact(false)} sheetHeight={550}>
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
            {selectedUsers.length > 0 && (
              <Button color={'primary'} title="Add to call" onPress={() => { setOpenContact(true); addUserVideoCall(socket!, username!, selectedUsers, callType as string) }} />
            )}
            <Button title="Close" onPress={() => setOpenContact(false)} />
          </View>
        </BottomSheet>
      )}

    </View>
  );
}