import notifee, { AndroidImportance, AndroidStyle, AndroidVisibility } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { getOpenRoomId } from '@/utils/globalRefs';
import { messageNotificationsOn } from '@/utils/notificationSettings';

// Shows a pushed message as a notification. Runs with the app open, in the background and
// closed (from index.js), so it only uses things that work without a screen.

// What the notification says for each kind of message (messages are end-to-end encrypted,
// so the push never has the text itself)
const BODY: Record<string, string> = {
    text: "New message",
    image: "📷 Photo",
    video: "🎥 Video",
    voice: "🎤 Voice message",
    audio: "🔊 Audio",
    document: "📄 Document",
    file: "📄 Document",
    location: "📍 Location",
    contact: "👤 Contact",
};

// First photo's link, only if it isn't locked (locked photos can't be shown before the app unlocks them)
const imageUrl = (content: any): string | null => {
    try {
        const c = typeof content === 'string' ? JSON.parse(content) : content;
        const first = c?.urls?.[0];
        return typeof first === 'string' ? first : first && !first.key ? first.url ?? null : null;
    } catch {
        return null;
    }
};

// The sender's name from my contacts, else their number
const senderName = async (phone: string) => {
    const friends: any[] = JSON.parse((await AsyncStorage.getItem("contactsFriend")) || "[]");
    const contact = friends.find((f) => String(f.phone) === String(phone));
    return contact?.name || contact?.full_name || phone;
};

export default async function CustomNotification(data: any) {
    if (!data) return;
    // Turned off in Settings → Notifications
    if (!messageNotificationsOn()) return;

    try {
        // The server's "missed call" push (the caller was busy or nobody answered)
        if (data.type === "missed_call") {
            await notifee.displayNotification({
                title: `Missed call from ${await senderName(data.senderId)}`,
                data: { type: "missed_call", senderId: String(data.senderId ?? "") },
                android: {
                    channelId: 'messages',
                    smallIcon: 'ic_launcher',
                    pressAction: { id: 'default', launchActivity: 'default' },
                },
                ios: { sound: 'default' },
            });
            return;
        }

        const body = BODY[data.messageType];
        if (!body) return; // not something we show

        // Already reading this chat: no notification
        if (AppState.currentState === "active" && data.conversationId && getOpenRoomId() === data.conversationId) return;

        // Needed to route the tap to the right room (also after a cold start). Notifee only accepts string values.
        const notifData: Record<string, string> = {};
        Object.entries(data).forEach(([k, v]) => {
            if (v != null) notifData[k] = typeof v === 'string' ? v : JSON.stringify(v);
        });

        const from = await senderName(data.senderId);
        const isGroup = data.conv_type === "group" && data.name;
        const picture = data.messageType === "image" ? imageUrl(data.content) : null;

        await notifee.displayNotification({
            // One notification per chat: a new message replaces the previous one instead of piling up
            id: data.conversationId ? `msg_${data.conversationId}` : undefined,
            title: isGroup ? data.name : from,
            body: isGroup ? `${from}: ${body}` : body,
            data: notifData,
            android: {
                channelId: 'messages',
                smallIcon: 'ic_launcher',
                importance: AndroidImportance.HIGH,
                visibility: AndroidVisibility.PRIVATE, // lock screen shows "new message", not who wrote
                pressAction: { id: 'default', launchActivity: 'default' },
                actions: [{ title: 'Reply', pressAction: { id: 'reply', launchActivity: 'default' }, icon: 'ic_reply' }],
                ...(picture && { style: { type: AndroidStyle.BIGPICTURE, picture } }),
            },
            ios: { sound: 'default' },
        });
    } catch (error) {
        console.error('[CustomNotification] Error displaying notification:', error);
    }
}
