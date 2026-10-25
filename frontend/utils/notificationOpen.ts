import notifee from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getInitialNotification as getInitialFcmNotification, getMessaging } from '@react-native-firebase/messaging';
import { router } from 'expo-router';
import { handlePickCall } from './callkeep';
import { getGlobalIsSocketConnected, getGlobalSocket, getGlobalUsername } from './globalRefs';
import { initializeSocket } from './socket';

// Handles a user opening the app from a notification (tap or action button),
// including when the app was killed. Headless handlers can't navigate, so they
// save the open with `savePendingNotificationOpen` and the UI consumes it once
// the navigator is mounted.

const PENDING_KEY = 'pending_notification_open';
const CALL_TYPES = ['audio_call', 'video_call', 'group_audio_call', 'group_video_call'];

type NotificationOpen = {
  id?: string;
  actionId: string;
  data: Record<string, any>;
};

const handledIds = new Set<string>();

export const savePendingNotificationOpen = async (open: NotificationOpen) => {
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(open));
};

const waitForSocket = async (timeoutMs = 10000) => {
  if (!getGlobalSocket()) await initializeSocket();
  const start = Date.now();
  while (!getGlobalIsSocketConnected() && Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 200));
  }
  return getGlobalSocket();
};

export const handleNotificationOpen = async ({ id, actionId, data }: NotificationOpen) => {
  if (id) {
    if (handledIds.has(id)) return;
    handledIds.add(id);
  }
  if (!data) return;

  if (CALL_TYPES.includes(data.type)) {
    if (actionId !== 'accept') return; // body tap just brings the app up; ringing notification stays
    if (id) await notifee.cancelNotification(id);
    const socket = await waitForSocket();
    const username = getGlobalUsername() || await AsyncStorage.getItem('username');
    handlePickCall(data, socket, username);
    return;
  }

  if (data.conversationId && (actionId === 'default' || actionId === 'reply')) {
    if (id) await notifee.cancelNotification(id);
    router.push({ pathname: '/screens/room', params: { id: data.conversationId } });
  }
};

// Call once the navigator is ready and the user is logged in (cold start or resume).
export const consumePendingNotificationOpen = async () => {
  try {
    const pending = await AsyncStorage.getItem(PENDING_KEY);
    if (pending) {
      await AsyncStorage.removeItem(PENDING_KEY);
      await handleNotificationOpen(JSON.parse(pending));
    }

    const initial = await notifee.getInitialNotification();
    if (initial?.notification?.data) {
      await AsyncStorage.setItem('last_notification', JSON.stringify(initial.notification));
      await handleNotificationOpen({
        id: initial.notification.id,
        actionId: initial.pressAction?.id || 'default',
        data: initial.notification.data,
      });
    }

    // FCM messages with a `notification` payload are shown by the OS, not notifee.
    const fcmInitial = await getInitialFcmNotification(getMessaging());
    if (fcmInitial?.data) {
      await handleNotificationOpen({
        id: fcmInitial.messageId,
        actionId: 'default',
        data: fcmInitial.data,
      });
    }
  } catch (error) {
    console.error('[NotificationOpen] Error handling opened notification:', error);
  }
};
