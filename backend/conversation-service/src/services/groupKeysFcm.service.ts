import axios from "axios";
// import { IChatMessage } from "../kafka/chatConsumer";

export const groupKeysNotification = async (receiverId: string, fcmPayload: any) => {
  try {
    const authServiceBaseURL = process.env.AUTH_SERVICE_BASE_URL!;
    const fcmServiceBaseURL = process.env.FCM_SERVICE_BASE_URL!;
    const internalApiKey = process.env.INTERNAL_API_KEY!;

    // fetch fcm tokens from auth service (kept same as before)
    const { data: userResponse } = await axios.post(
      `${authServiceBaseURL}/api/v1/profile/get-fcm-by-phone`,
      { phone: receiverId },
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

    // prepare payload
    const payload = {
      receiverPhone: receiverId,
      tokens: uniqueTokens,
      data: {
        screen: "group_key_chat",
        type: "group_key_chat",
        app_code: "SP_MAIN",
        ...fcmPayload,
      },
      android: { priority: "high" },
      apns: {
        headers: { "apns-priority": "10", "apns-push-type": "alert" },
        payload: {
          aps: {
            alert: { title: "", body: "" },
            sound: "default",
            badge: 0,
            "content-available": 1,
            "mutable-content": 1,
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
          `📲 Group Key FCM summary for user ${receiverId}: sent=${fcmRes.successTokens}, removed=${fcmRes.failedTokens}`,
        );
      }
      else {
        console.error(`❌ Group Key FCM send failed to ${receiverId}`);
      }
    } catch (err: any) {
      const errorMsg = extractAxiosError(err);
      console.error(`❌ Group Key FCM send failed: ${errorMsg}`);
    }

    return {
      sent: successCount > 0,
      success: successCount,
      removed: removedCount,
      total: uniqueTokens.length,
    };
  } catch (error: any) {
    console.error(
      "❌ Group Key FCM Notification Failed:",
      error?.response?.data || error?.message || error,
    );
    return { sent: false, message: error?.message || String(error) };
  }
};
