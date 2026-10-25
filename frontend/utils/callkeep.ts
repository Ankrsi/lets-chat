import { acceptVideoCall, handleIncommingVideoCall, rejectVideoCall } from '@/contexts/videoCallController';
import inCallManager from 'react-native-incall-manager';
import notifee, { AndroidCategory, AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import { handleIncommingGroupVideoCall } from '@/contexts/groupVideoCallService';
import { getGlobalSocket, getGlobalUsername } from './globalRefs';

const RINGTONE_SECONDS = 25;

// Audio and video calls share one flow (the video handlers); `callType` says "audio" or "video".
// Older pushes may still say audio_call / group_audio_call, so those are treated the same way.
const isOneToOne = (type: string) => type == "video_call" || type == "audio_call";
const isGroup = (type: string) => type == "group_video_call" || type == "group_audio_call";
const callTypeOf = (data: any): "audio" | "video" =>
  data?.callType === "audio" || data?.type === "audio_call" || data?.type === "group_audio_call" ? "audio" : "video";

export const handlePickCall = (data: any, socketParam: any, usernameParam: any) => {
  const socket = socketParam || getGlobalSocket();
  const username = usernameParam || getGlobalUsername();
  if (isOneToOne(data.type)) {
    handleIncommingVideoCall({
      socket,
      callId: data?.callId,
      from: data?.fromm,
      to: data?.to,
      conversationId: data?.conversationId,
      callType: callTypeOf(data),
    })
  }
  if (isGroup(data.type)) {
    handleIncommingGroupVideoCall({
      socket,
      callId: data?.callId,
      from: data?.fromm,
      to: data?.to,
      conversationId: data?.conversationId,
      myId: username
    })
  }
};

export const handleDropCall = (data: any, socketParam: any) => {
  const socket = socketParam || getGlobalSocket();
  if (isOneToOne(data.type)) {
    rejectVideoCall(socket!, data?.to, data?.fromm);
  }
};

export const showIncomingCall = async (data: any) => {
  const socket = getGlobalSocket();
  if (isOneToOne(data.type) && data.switchToVideo == "true") {
    acceptVideoCall(socket!, data?.to, data?.fromm, data?.conversationId, data?.callId, data?.offerType, callTypeOf(data));
    return;
  }
  if (isOneToOne(data.type) || isGroup(data.type)) {
    inCallManager.startRingtone('_DEFAULT_', 0, 'default', RINGTONE_SECONDS);
    // Unanswered calls are timed out by the server (video:start-call), nothing to send here
  }
  await notifee.displayNotification({
    title: `Incoming call ${data.type.split('_').join(" ")}`,
    body: `Incoming ${data.type.split('_').join(" ")}`,
    data,
    android: {
      channelId: 'calls',
      smallIcon: 'ic_launcher',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      category: AndroidCategory.CALL,
      pressAction: {
        id: 'default',
        launchActivity: 'default',
      },
      actions: [
        {
          title: 'Decline',
          pressAction: {
            id: 'reject',
          },
          icon: 'ic_decline'
        },
        {
          title: 'Answer',
          pressAction: {
            id: 'accept',
            launchActivity: 'default'
          },
          icon: 'ic_accept'
        },
      ],
      ongoing: true,
      autoCancel: false,
    },
  });
};