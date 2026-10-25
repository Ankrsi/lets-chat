import CustomNotification from '@/app/components/customNotification';
import { handleGroupKeyPacket } from '@/utils/e2ee';
import { PLAMAPI } from '@/utils/api';
import { handleDropCall, handlePickCall, showIncomingCall } from '@/utils/callkeep';
import { getGlobalIsSocketConnected, getGlobalSocket, getGlobalUsername, setGlobalIsSocketConnected, setGlobalUsername } from '@/utils/globalRefs';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMessaging, onMessage } from '@react-native-firebase/messaging';
import React, { createContext, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import inCallManager from 'react-native-incall-manager';
import { consumePendingNotificationOpen, handleNotificationOpen } from '@/utils/notificationOpen';
import { initializeSocket } from '../utils/socket';

interface SocketContextType { }

const SocketContext = createContext<SocketContextType>({});

const NO_VALUE = {}; // stable: a new {} each render would re-render every consumer

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const socket = getGlobalSocket();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (getGlobalIsSocketConnected()) {
      (async () => {
        const username = String(await AsyncStorage.getItem("username")) || "";
        setGlobalUsername(username);
        // }
      })();
    }
  }, [getGlobalIsSocketConnected()]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (appState.current !== nextState) {
        appState.current = nextState;
        console.info("AppState changed to", nextState);
        if (nextState === "active") {
          // Resumed from background by a notification tap / Answer action.
          if (await AsyncStorage.getItem("token")) {
            await consumePendingNotificationOpen();
          }
          // initializeSocket();
        }

        if (nextState === "background" || nextState === "inactive") {
          setGlobalIsSocketConnected(false);
        }
      }
    });

    initializeSocket();

    return () => {
      socket?.off('connect');
      socket?.off('disconnect');
      sub.remove();
    }
  }, []);

  // Setup Firebase messaging listeners only once
  useEffect(() => {
    const messaging = getMessaging();
    const unsubscribe = onMessage(messaging, async (remoteMessage: any) => {
      await AsyncStorage.setItem('last_notification_data', JSON.stringify(remoteMessage.data || {}));
      if (remoteMessage.data?.type === 'audio_call' ||
        remoteMessage.data?.type === 'video_call' ||
        remoteMessage.data?.type === 'group_audio_call' ||
        remoteMessage.data?.type === 'group_video_call') {
        showIncomingCall(remoteMessage.data);
        // router.push({
        //   pathname: '/screens/callScreens/incomingCall',
        //   params: { data: JSON.stringify(remoteMessage.data) },
        // });
      }
      else if (remoteMessage.data?.type == "plam_wallet_permission") {
        notifee.displayNotification({
          title: `${remoteMessage.data?.title}` || "New Notification",
          body: remoteMessage.data?.content,
          android: {
            channelId: 'messages',
            smallIcon: 'ic_launcher',
            importance: AndroidImportance.DEFAULT,
            actions: [
              {
                title: 'Accept',
                pressAction: { id: 'plam_pay_accept' },
              },
              {
                title: 'Reject',
                pressAction: { id: 'plam_pay_reject' },
              },
            ]
          },
          ios: {
            sound: 'default',
            categoryId: 'auth_request'
          },
        });
      }
      else if (remoteMessage.data?.type === 'group_key_chat') {
        try {
          let msg = remoteMessage.data;
          const keyMsg: any = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
          await handleGroupKeyPacket(keyMsg.senderId, keyMsg.content);
        } catch (error) {
          console.info("Error processing group key:", error);
        }
      }
      else {
        await CustomNotification(remoteMessage.data);
      }
    });

    const notifeeUnsubscribe = notifee.onForegroundEvent(async ({ type, detail }) => {
      const { notification, pressAction } = detail;
      await AsyncStorage.setItem('last_notification', JSON.stringify(notification || {}));
      const data = notification?.data;
      if (type === EventType.PRESS || (type === EventType.ACTION_PRESS && pressAction?.id === 'reply')) {
        await handleNotificationOpen({ id: notification?.id, actionId: pressAction?.id || 'default', data: data || {} });
      }

      if (type === EventType.ACTION_PRESS && pressAction?.id === 'accept') {
        // router.push({
        //   pathname: '/screens/callScreens/incomingCall',
        //   params: { data: JSON.stringify(data) },
        // });
        await notifee.cancelNotification(notification?.id || "");
        inCallManager.stopRingtone();
        handlePickCall(data, socket, getGlobalUsername());
      }

      if (type === EventType.ACTION_PRESS && pressAction?.id === 'reject') {
        // socketRef.current?.emit('call:reject', data);
        await notifee.cancelNotification(notification?.id || "");
        inCallManager.stopRingtone();
        handleDropCall(data, socket);
      }

      if (type === EventType.ACTION_PRESS && pressAction?.id === 'plam_pay_accept') {
        // socketRef.current?.emit('call:reject', data);
        await notifee.cancelNotification(notification?.id || "");
        await PLAMAPI.patch("/palm/register-palm-request", { "status": "ACCEPTED" });
      }

      if (type === EventType.ACTION_PRESS && pressAction?.id === 'plam_pay_reject') {
        // socketRef.current?.emit('call:reject', data);
        await notifee.cancelNotification(notification?.id || "");
        await PLAMAPI.patch("/palm/register-palm-request", { "status": " REJECTED" });
      }
    });

    return () => {
      unsubscribe();
      notifeeUnsubscribe();
    };
  }, [getGlobalIsSocketConnected(), getGlobalUsername()]);

  return (
    <SocketContext.Provider value={NO_VALUE}>
      {children}
    </SocketContext.Provider>
  );
};
