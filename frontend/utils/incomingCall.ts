import { handleIncommingVideoCall, rejectVideoCall } from '@/contexts/videoCallController';
import inCallManager from 'react-native-incall-manager';
import notifee, { AndroidCategory, AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import { handleIncommingGroupVideoCall } from '@/contexts/groupVideoCallService';
import { getGlobalSocket, getGlobalUsername } from './globalRefs';

// Incoming calls always arrive as a push (FCM / APNs), in the foreground too:
//   push → showIncomingCall: ringtone + ringing notification with Answer / Decline
//   Answer  → handlePickCall → joins the call and opens the call screen
//   Decline → handleDropCall → tells the caller
//   Caller hangs up / nobody answers → stopRinging

const RING_SECONDS = 30; // same as the server: after this the call is "missed"

// Audio and video calls share one flow (the video handlers); `callType` says "audio" or "video".
// Older pushes may still say audio_call / group_audio_call, so those are treated the same way.
const isOneToOne = (type: string) => type == "video_call" || type == "audio_call";
const isGroup = (type: string) => type == "group_video_call" || type == "group_audio_call";
const callTypeOf = (data: any): "audio" | "video" =>
  data?.callType === "audio" || data?.type === "audio_call" || data?.type === "group_audio_call" ? "audio" : "video";

// One ringing notification per call, so it can be removed when the call stops ringing
const notificationId = (callId: string) => `call_${callId}`;

// Stops the ringtone and removes the ringing notification (all of them if no callId is known)
export const stopRinging = async (callId?: string | null) => {
  inCallManager.stopRingtone();
  try {
    if (callId) {
      await notifee.cancelNotification(notificationId(callId));
      return;
    }
    const shown = await notifee.getDisplayedNotifications();
    await Promise.all(
      shown.filter((n) => n.notification.android?.channelId === 'calls').map((n) => notifee.cancelNotification(n.id!)),
    );
  } catch (err) {
    console.info('[call] could not remove ringing notification', err);
  }
};

// Answer can reach us twice (the notification button, then again when the app comes to the front).
// Answering twice makes both phones start the connection at once, so each call is answered once.
const answered = new Set<string>();

export const handlePickCall = (data: any, socketParam: any, usernameParam: any) => {
  const socket = socketParam || getGlobalSocket();
  const username = usernameParam || getGlobalUsername();
  stopRinging(data?.callId);
  if (data?.callId) {
    if (answered.has(data.callId)) return;
    answered.add(data.callId);
  }
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
  stopRinging(data?.callId);
  if (isOneToOne(data.type)) {
    // The call ID comes from the push: after a cold start the app doesn't know it otherwise
    rejectVideoCall(socket!, data?.to, data?.fromm, data?.callId);
  }
};

export const showIncomingCall = async (data: any) => {
  // The caller hung up before it was answered
  if (data.offerType === 'CALL_ENDED') {
    await stopRinging(data.callId);
    return;
  }
  if (!isOneToOne(data.type) && !isGroup(data.type)) return;

  inCallManager.startRingtone('_DEFAULT_', 0, 'default', RING_SECONDS);
  const kind = `${isGroup(data.type) ? 'group ' : ''}${callTypeOf(data)} call`;

  await notifee.displayNotification({
    id: data.callId ? notificationId(data.callId) : undefined,
    title: data.fromm || 'Incoming call',
    body: `Incoming ${kind}`,
    data,
    android: {
      channelId: 'calls',
      smallIcon: 'ic_launcher',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      category: AndroidCategory.CALL,
      timeoutAfter: RING_SECONDS * 1000, // removed by itself if nobody answers
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
