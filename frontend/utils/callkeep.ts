import { acceptVideoCall, handleIncommingVideoCall, rejectVideoCall } from '@/contexts/videoCallController';
import { handleAudioIncommingCall, ringtoneTime } from '@/contexts/CallController';
import inCallManager from 'react-native-incall-manager';
import notifee, { AndroidCategory, AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import { handleIncommingGroupAudioCall } from '@/contexts/groupCallService';
import { handleIncommingGroupVideoCall } from '@/contexts/groupVideoCallService';
import { getGlobalSocket, getGlobalUsername } from './globalRefs';

export const handlePickCall = (data: any, socketParam: any, usernameParam: any) => {
  const socket = socketParam || getGlobalSocket();
  const username = usernameParam || getGlobalUsername();
  if (data.type == "audio_call") {
    handleAudioIncommingCall({
      callId: data?.callId,
      from: data?.fromm,
      to: data?.to,
      offer: JSON.parse(data?.offer),
      offerType: data?.offerType,
      conversationId: data?.conversationId,
    });
  }
  if (data.type == "video_call") {
    handleIncommingVideoCall({
      socket,
      callId: data?.callId,
      from: data?.fromm,
      to: data?.to,
      conversationId: data?.conversationId,
    })
  }
  if (data.type == "group_audio_call") {
    handleIncommingGroupAudioCall({
      socket,
      callId: data?.callId,
      from: data?.fromm,
      to: data?.to,
      conversationId: data?.conversationId,
      myId: username
    })
  }
  if (data.type == "group_video_call") {
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
  if (data.type == "audio_call") {
    socket?.emit("call:reject", { callId: data?.callId, from: data?.to, to: data?.fromm });
  }
  if (data.type == "video_call") {
    rejectVideoCall(socket!, data?.to, data?.fromm);
  }
};

export const showIncomingCall = async (data: any) => {
  const socket = getGlobalSocket();
  if(data.type == "video_call" && data.switchToVideo == "true") {
    acceptVideoCall(socket!, data?.to, data?.fromm, data?.conversationId, data?.callId, data?.offerType);
    return;
  }
  if (data.type == "audio_call" || data.type == "video_call" || data.type == "group_audio_call" || data.type == "group_video_call") {
    inCallManager.startRingtone('_DEFAULT_', 0, 'default', ringtoneTime);
    if (data.type == "video_call") {
      socket?.emit("video:missed-call-timmer", {
        callId: data?.callId,
        from: data?.to,
        to: data?.fromm,
        conversationId: data?.conversationId,
        timestamp: new Date()
      })
    }
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