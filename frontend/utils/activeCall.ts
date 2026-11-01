import notifee, { AndroidImportance } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';

// The call that's going on right now (1:1 or group), so the user can leave the call screen
// and come back: the bar at the top of the app and the ongoing-call notification both use it.

export const CALL_SCREEN = "/screens/callScreens/videoInCall";
export const NOTIFICATION_ID = "ongoing_call";

export type ActiveCall = {
  params: Record<string, string>; // what the call screen is opened with
  isGroup: boolean;
  connectedAt: number | null; // for the timer
  // The call screen's buttons, so they look right when the screen is opened again
  muted: boolean;
  cameraOff: boolean;
  speaker: boolean;
};

let current: ActiveCall | null = null;
export const getActiveCall = () => current;

const update = (next: ActiveCall | null) => {
  current = next;
  DeviceEventEmitter.emit("active-call", next);
  showNotification().catch((err) => console.info("[call] ongoing notification failed", err));
};

export const startActiveCall = (params: Record<string, string>, isGroup: boolean, speaker: boolean) =>
  update({ params, isGroup, connectedAt: null, muted: false, cameraOff: false, speaker });

export const markCallConnected = () => {
  if (current && !current.connectedAt) update({ ...current, connectedAt: Date.now() });
};

export const updateCallControls = (controls: Partial<Pick<ActiveCall, "muted" | "cameraOff" | "speaker">>) => {
  if (current) current = { ...current, ...controls };
};

// Voice <-> video switch: the call screen opens in the right mode next time, the notification follows
export const changeCallType = (callType: "audio" | "video") => {
  if (current && !current.isGroup && current.params.callType !== callType) {
    update({ ...current, params: { ...current.params, callType } });
  }
};

export const clearActiveCall = () => {
  if (current) update(null);
};

export const openCallScreen = () => {
  if (current) router.push({ pathname: CALL_SCREEN, params: current.params });
};

// For components: re-renders when a call starts, connects or ends
export function useActiveCall() {
  const [call, setCall] = useState(current);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("active-call", setCall);
    setCall(current);
    return () => sub.remove();
  }, []);
  return call;
}

// Name of the other person (or "Group call") for the notification
const callName = async (call: ActiveCall) => {
  if (call.isGroup) return "Group call";
  const me = await AsyncStorage.getItem("username");
  const other = String(call.params.from) === String(me) ? call.params.to : call.params.from;
  const friends: any[] = JSON.parse((await AsyncStorage.getItem("contactsFriend")) || "[]");
  const contact = friends.find((f) => String(f.phone) === String(other));
  return contact?.name || contact?.full_name || other;
};

let channelReady = false;

// "Ongoing call" notification with a timer and a Hang up button; removed when the call ends
async function showNotification() {
  const call = current;
  if (!call) {
    await notifee.cancelNotification(NOTIFICATION_ID);
    return;
  }
  if (!channelReady) {
    // Quiet channel: this notification must never ring or buzz
    await notifee.createChannel({ id: NOTIFICATION_ID, name: 'Ongoing call', importance: AndroidImportance.LOW });
    channelReady = true;
  }
  const video = call.params.callType !== "audio";
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: await callName(call),
    body: call.connectedAt ? `Ongoing ${video ? "video" : "voice"} call` : "Calling…",
    data: { type: NOTIFICATION_ID },
    android: {
      channelId: NOTIFICATION_ID,
      smallIcon: 'ic_launcher',
      ongoing: true,
      autoCancel: false,
      onlyAlertOnce: true,
      showChronometer: !!call.connectedAt,
      timestamp: call.connectedAt ?? undefined,
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [{ title: 'Hang up', pressAction: { id: 'hangup' } }],
    },
  });
}
