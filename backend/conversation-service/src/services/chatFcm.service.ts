import axios from "axios";

export interface IChatMessage {
  messageId: string,
  conversationId: string,
  senderId: string,
  content: string | object,
  attachments: object[],
  status: "sent" | "delivered" | "read",
  timestamp: Date,
  messageType: "text" | "image" | "video" | "location" | "audio" | "file" | "money" | "document",
  name?: string,
  avatar?: string,
  conv_type?: string,
  app_code?: string,
  role?: string,
}

export const sendChatFCMNotification = async (receiverId: string, message: IChatMessage) => {
  try {
    const authServiceBaseURL = process.env.AUTH_SERVICE_BASE_URL!;
    const fcmServiceBaseURL = process.env.FCM_SERVICE_BASE_URL!;
    const internalApiKey = process.env.INTERNAL_API_KEY!;

    // fetch fcm tokens from auth service (kept same as before)
    const { data: userResponse } = await axios.post(
      `${authServiceBaseURL}/api/v1/profile/get-fcm-by-phone`,
      { phone: receiverId, role: message.role || "individual" },
      { headers: { "x-internal-api-key": internalApiKey } },
    );

    const fcmTokens: string[] = userResponse?.data?.token || [];
    const deviceType: string = userResponse?.data?.device_type || "android";

    if (!fcmTokens.length) {
      console.info(`⚠️ No FCM tokens found for user ${receiverId}`);
      return { sent: false, message: "No FCM tokens found" };
    }

    // remove false/duplicate tokens
    const uniqueTokens = Array.from(new Set(fcmTokens.filter(Boolean)));

    const title = `New message from ${message.senderId}`;
    const body =
      message.messageType === "text"
        ? (typeof message.content === 'object' && message.content ? (message.content as any).msg?.slice(0, 30) : String(message.content).slice(0, 30)) + "..."
        : `📎 ${message.messageType} message`;
    // prepare payloads
    const payload = {
      receiverPhone: receiverId,
      tokens: uniqueTokens,
      data: {
        ...message,
        screen: "chat_screen",
        type: "chat_message",
        messageId: message.messageId,
        senderId: message.senderId,
        content: message.content,
        timestamp: message.timestamp,
        messageType: message.messageType,
        conversationId: message.conversationId,
        name: message.name || "",
        avatar: message.avatar || "",
        conv_type: message.conv_type || "",
        status: message.status,
        app_code: message.app_code || "SP_MAIN",
      },
      android: { priority: "high", ttl: 86400000 },
      apns: {
        headers: { "apns-priority": "10", "apns-expiration": `${Math.floor(Date.now() / 1000) + 86400}`, },
        payload: {
          aps: {
            alert: { title, body },
            sound: "default",
            "content_available": 1,
            "mutable-content": 1
          },
        },
      },
      device_type: deviceType,
    };
    let successCount = 0;
    let removedCount = 0;

    // error helper
    const extractAxiosError = (err: any): string => {
      const data = err?.response?.data;
      if (!data) return err?.message || String(err);
      if (typeof data === "string") return data;
      if (typeof data?.error === "string") return data.error;
      if (data?.error?.message) return data.error.message;
      if (data?.message) return data.message;
      try {
        return JSON.stringify(data);
      } catch {
        return String(data);
      }
    };

    // send notifications
    try {
      let resData = await axios.post(`${fcmServiceBaseURL}/api/v1/fcm/send-multi-fcms`, payload, {
        headers: { "x-internal-api-key": internalApiKey },
      });
      if (resData.data) {
        let data = resData.data.data;
        let fcmRes = data.fcmResponse
        successCount = fcmRes.successTokens;
        removedCount = fcmRes.failedTokens;
        console.info(
          `📲 Chat FCM summary for user ${receiverId}: sent=${fcmRes.successTokens}, removed=${fcmRes.failedTokens}`,
        );
      }
      else {
        console.error(`❌ FCM send failed to ${receiverId}`);
      }
    } catch (err: any) {
      const errorMsg = extractAxiosError(err);
      console.error(`❌ FCM send failed: ${errorMsg}`);
    }

    return {
      sent: successCount > 0,
      success: successCount,
      removed: removedCount,
      total: uniqueTokens.length,
    };
  } catch (error: any) {
    console.error(
      "❌ Chat FCM Notification Failed:",
      error?.response?.data || error?.message || error,
    );
    return { sent: false, message: error?.message || String(error) };
  }
};
