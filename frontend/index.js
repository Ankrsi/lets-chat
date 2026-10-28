import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
// import { AppRegistry } from 'react-native';
import 'react-native-get-random-values';
import inCallManager from 'react-native-incall-manager';
import CustomNotification from './app/components/customNotification';
import { handleGroupKeyPacket } from './utils/e2ee';
import { handleDropCall, showIncomingCall } from './utils/callkeep';
import { getGlobalSocket, getGlobalUsername } from './utils/globalRefs';
import { savePendingNotificationOpen } from './utils/notificationOpen';
import { initializeSocket } from './utils/socket';

const initializeNotificationChannels = async () => {
  try {
    await notifee.createChannel({
      id: 'calls',
      name: 'Incoming Calls',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
    });
    console.log('[Notifee] Calls channel created');
  } catch (error) {
    console.error('[Notifee] Error creating calls channel:', error);
  }

  try {
    await notifee.createChannel({
      id: 'messages',
      name: 'Messages',
      importance: AndroidImportance.HIGH,
      sound: 'default',
    });
    console.log('[Notifee] Messages channel created');
  } catch (error) {
    console.error('[Notifee] Error creating messages channel:', error);
  }
};

const ensureSocketInitialized = async () => {
  let socket = getGlobalSocket() || null;
  let username = getGlobalUsername() || null;

  if (!username) {
    username = await AsyncStorage.getItem('username');
  }

  if (!socket || !username) {
    try {
      await initializeSocket();
      socket = getGlobalSocket();
    } catch (error) {
      console.error('[FCM] Error initializing socket in background handler:', error);
    }
  }

  return { socket, username };
};

const handleRemoteMessage = async (remoteMessage) => {
  try {
    console.log('[FCM] Background message:', remoteMessage?.data?.type);

    const { socket } = await ensureSocketInitialized();
    const data = remoteMessage?.data || {};
    if (data.type === 'audio_call' || data.type === 'video_call' || data.type === 'group_audio_call' || data.type === 'group_video_call') {
      try {
        showIncomingCall(data);
      } catch (error) {
        console.error('[FCM] Error showing incoming call in background:', error);
      }
    } else if (data.type === 'group_key_chat') {
      try {
        const msg = data;
        const keyMsg = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
        await handleGroupKeyPacket(keyMsg.senderId, keyMsg.content);
      } catch (error) {
        console.error('[FCM] Error processing group key in background:', error);
      }
    } else {
      try {
        await CustomNotification(data);
        console.log('[FCM] Custom notification displayed in background');
      } catch (error) {
        console.error('[FCM] Error displaying custom notification in background:', error);
      }
    }

    await AsyncStorage.setItem('last_notification_data', JSON.stringify(data));
  } catch (error) {
    console.error('[FCM] Unexpected error in background message handler:', error);
  }
};

const handleNotifeeEvent = async ({ type, detail }) => {
  try {
    const { notification, pressAction } = detail;
    await AsyncStorage.setItem('last_notification', JSON.stringify(notification || {}));
    const { socket, username } = await ensureSocketInitialized();
    const data = notification?.data || {};

    // Accept launches the app (launchActivity), and the UI may not be mounted yet
    // (killed state), so defer the actual pick-up to the UI via the pending open.
    if (type === EventType.ACTION_PRESS && pressAction?.id === 'accept') {
      try {
        await notifee.cancelNotification(notification?.id || '');
        inCallManager.stopRingtone();
        await savePendingNotificationOpen({ id: notification?.id, actionId: 'accept', data });
        console.log('[Notifee] Accept action saved for app launch');
      } catch (error) {
        console.error('[Notifee] Error handling accept action:', error);
      }
    }

    if (type === EventType.PRESS || (type === EventType.ACTION_PRESS && pressAction?.id === 'reply')) {
      await savePendingNotificationOpen({ id: notification?.id, actionId: pressAction?.id || 'default', data });
    }

    if (type === EventType.ACTION_PRESS && pressAction?.id === 'reject') {
      try {
        await notifee.cancelNotification(notification?.id || '');
        inCallManager.stopRingtone();
        handleDropCall(data, socket);
        console.log('[Notifee] Reject action handled');
      } catch (error) {
        console.error('[Notifee] Error handling reject action:', error);
      }
    }

  } catch (error) {
    console.error('[Notifee] Unexpected error in background event handler:', error);
  }
};

initializeNotificationChannels().catch(console.error);

// AppRegistry.registerHeadlessTask('ReactNativeFirebaseMessagingHeadlessTask', () => handleRemoteMessage);
// AppRegistry.registerHeadlessTask('app.notifee.notification-event', () => handleNotifeeEvent);

messaging().setBackgroundMessageHandler(handleRemoteMessage);
notifee.onBackgroundEvent(handleNotifeeEvent);

import 'expo-router/entry';

