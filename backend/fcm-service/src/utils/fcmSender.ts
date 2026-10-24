// import messaging from "../config/firebaseConfig";
import { BatchResponse, WebpushConfig } from "firebase-admin/messaging";
import admin from "../config/firebase";

const messaging = admin.messaging();
export type DataPayload = { [key: string]: string };
export type NotificationPayload = { title?: string; body?: string };

function stringifyData(data: any = {}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key in data) {
    const value = data[key];
    result[key] =
      typeof value === "string" ? value : JSON.stringify(value);
  }
  return result;
}

export async function sendToDevice(
  token: string,
  data: DataPayload,
  notification?: NotificationPayload,
) {
  const message: any = { token, data };
  if (notification) message.notification = notification;
  return messaging.send(message);
}

interface FCMMessagesParams {
  tokens: string[];
  notification?: {
    title: string;
    body: string;
  };
  data?: Record<string, string>;
  device_type: "android" | "ios" | "web";
  android?: any;
  apns?: any;
  webpush?: any;
}

export async function sendToDevices(
  {
    tokens,
    notification,
    data,
    device_type,
    android,
    apns,
    webpush
  }: FCMMessagesParams) {

  const safeData = stringifyData(data);

  const message: any = {
    tokens,
    data: safeData,
    notification,
  };

  if (device_type === "android") {
    message.android = android || {
      priority: "high",
      ttl: 86400000,
      notification: {
        sound: "default",
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
    };
  }
  if (device_type === "ios") {
    message.apns = apns || {
      headers: {
        "apns-priority": "10",
        "apns-expiration": `${Math.floor(Date.now() / 1000) + 86400}`,
      },
      payload: {
        aps: {
          alert: notification,
          sound: "default",
          badge: 1,
          "content-available": 1,
          "mutable-content": 1,
        },
      },
    };
  }

  if (device_type === "web") {
    message.webpush = webpush || {
      headers: { Urgency: "high", TTL: "86400" },
      notification: {
        ...notification,
        icon: "/icons/notification-192.png",
        badge: "/icons/badge-72.png",
      },
      fcmOptions: { link: safeData?.url ?? "https://yourapp.com" },
    };
  }

  const res: BatchResponse = await messaging.sendEachForMulticast(message);
  const failedTokens: string[] = [];
  const successTokens: string[] = [];
  res.responses.forEach((response, index) => {
    if (!response.success) {
      const token = tokens[index];
      failedTokens.push(token);
    }
    else {
      const token = tokens[index];
      successTokens.push(token);
    }
  });
  return { failedTokens, successTokens };
}

interface FCMMessageParams {
  token: string;
  notification?: {
    title: string;
    body: string;
  };
  data?: Record<string, string>;
  device_type: "android" | "ios" | "web";
  android?: any;
  apns?: any;
  webpush?: WebpushConfig;
}

export const sendMessageToDevice = async ({
  token,
  notification,
  data,
  device_type,
  android,
  apns,
  webpush
}: FCMMessageParams) => {

  console.info('data to send msg ', {
    token,
    notification,
    data,
    device_type,
    android,
    apns,
    webpush
  })

  const safeData = stringifyData(data);

  const message: any = {
    token,
    data: safeData,
    notification,
  };
  if (device_type === "android") {
    message.android = android || {
      priority: "high",
      notification: {
        sound: "default",
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
    };
    console.info('android')
  }

  if (device_type === "ios") {
    message.apns = apns || {
      headers: {
        "apns-priority": "10",
      },
      payload: {
        aps: {
          alert: notification,
          sound: "default",
          badge: 1,
          "content-available": 1,
          "mutable-content": 1,
        },
      },
    };
    console.info('ios')
  }

  if (device_type === "web") {
    message.webpush = webpush || {
      headers: { Urgency: "high", TTL: "86400" },
      notification: {
        ...notification,
        icon: "/icons/notification-192.png",
        badge: "/icons/badge-72.png",
      },
      fcmOptions: { link: safeData?.url ?? "https://yourapp.com" },
    };
  }
  console.info('sent done')
  return await messaging.send(message);
};
