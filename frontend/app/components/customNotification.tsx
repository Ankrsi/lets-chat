import notifee, { AndroidCategory, AndroidImportance, AndroidStyle, AndroidVisibility } from '@notifee/react-native';

export default async function CustomNotification(data: any) {
    if (!data) return;
    // Needed to route the tap to the right room (also after a cold start). Notifee only accepts string values.
    const notifData: Record<string, string> = {};
    Object.entries(data).forEach(([k, v]) => {
        if (v != null) notifData[k] = typeof v === 'string' ? v : JSON.stringify(v);
    });
    try {
        if (data.messageType === "text") {
            await notifee.displayNotification({
                title: `New message from ${data?.senderId}` || "New Notification",
                data: notifData,
                // body: JSON.parse(data?.content)?.msg || "You have a new message",
                body: "You have a new message",
                android: {
                    channelId: 'messages',
                    pressAction: { id: 'default', launchActivity: 'default' },
                    smallIcon: 'ic_launcher',
                    importance: AndroidImportance.HIGH,
                    visibility: AndroidVisibility.PUBLIC,
                    category: AndroidCategory.CALL,
                    // style: {
                    //     type: AndroidStyle.MESSAGING,
                    //     person: {
                    //         name: data?.senderId || "Sender",
                    //         icon: data?.senderAvatar || 'https://my-cdn.com/avatars/default.png',
                    //     },
                    //     messages: [
                    //         {
                    //             text: JSON.parse(data?.content)?.msg || "You have a new message",
                    //             timestamp: Date.now() - 600000,
                    //         },
                    //     ]
                    // },
                    actions: [
                        {
                            title: 'Reply',
                            pressAction: {
                                id: 'reply',
                                launchActivity: 'default'
                            },
                            icon: 'ic_reply'
                        },
                        {
                            title: 'Mute',
                            pressAction: {
                                id: 'mute',
                                launchActivity: 'default'
                            },
                            icon: 'ic_mute'
                        },
                    ],
                    ongoing: true,
                    autoCancel: false,
                },
                ios: {
                    sound: 'default',
                },
            });
        }
        else if (data.messageType === "image") {
            await notifee.displayNotification({
                title: `New image from ${data?.senderId}` || "New Notification",
                data: notifData,
                body: "You have received a new image",
                android: {
                    channelId: 'messages',
                    pressAction: { id: 'default', launchActivity: 'default' },
                    smallIcon: 'ic_launcher',
                    importance: AndroidImportance.DEFAULT,
                    style: {
                        type: AndroidStyle.BIGPICTURE,
                        picture: JSON.parse(data?.content)?.url || 'https://my-cdn.com/images/default.png',
                    },
                },
                ios: {
                    sound: 'default',
                },
            });
        }
        else if (data.messageType === "video") {
            await notifee.displayNotification({
                title: `New video from ${data?.senderId}` || "New Notification",
                data: notifData,
                body: "🎥 You have received a new video",
                android: {
                    channelId: 'messages',
                    pressAction: { id: 'default', launchActivity: 'default' },
                    smallIcon: 'ic_launcher',
                    importance: AndroidImportance.DEFAULT,
                },
                ios: {
                    sound: 'default',
                },
            });
        }
        else if (data.messageType === "file") {
            await notifee.displayNotification({
                title: `New file from ${data?.senderId}` || "New Notification",
                data: notifData,
                body: "📎 You have received a new file",
                android: {
                    channelId: 'messages',
                    pressAction: { id: 'default', launchActivity: 'default' },
                    smallIcon: 'ic_launcher',
                    importance: AndroidImportance.DEFAULT,
                },
                ios: {
                    sound: 'default',
                },
            });
        }
        else if (data.messageType === "audio") {
            await notifee.displayNotification({
                title: `New audio message from ${data?.senderId}` || "New Notification",
                data: notifData,
                body: "🔊 You have received a new audio message",
                android: {
                    channelId: 'messages',
                    pressAction: { id: 'default', launchActivity: 'default' },
                    smallIcon: 'ic_launcher',
                    importance: AndroidImportance.DEFAULT,
                },
                ios: {
                    sound: 'default',
                },
            });
        }
        else if (data.messageType === "location") {
            await notifee.displayNotification({
                title: `New location from ${data?.senderId}` || "New Notification",
                data: notifData,
                body: "📍 You have received a new location",
                android: {
                    channelId: 'messages',
                    pressAction: { id: 'default', launchActivity: 'default' },
                    smallIcon: 'ic_launcher',
                    importance: AndroidImportance.DEFAULT,
                },
                ios: {
                    sound: 'default',
                },
            });
        }
        else if (data.messageType === "contact") {
            await notifee.displayNotification({
                title: `New contact from ${data?.senderId}` || "New Notification",
                data: notifData,
                body: "👤 You have received a new contact",
                android: {
                    channelId: 'messages',
                    pressAction: { id: 'default', launchActivity: 'default' },
                    smallIcon: 'ic_launcher',
                    importance: AndroidImportance.DEFAULT,
                },
                ios: {
                    sound: 'default',
                },
            });
        }
    } catch (error) {
        console.error('[CustomNotification] Error displaying notification:', error);
    }
    return;
}