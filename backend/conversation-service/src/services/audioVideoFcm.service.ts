import axios from "axios";

export interface IChatMessage {
  messageId?: string,
  conversationId?: string,
  fromm: string,
  to: string,
  callId: string,
  offer?: any,
  bookingId?: string,
  messageType: "video" | "audio" | "taxi_audio" | "group_audio" | "group_video",
  offerType?: string,
  isIncoming?: boolean,
  switchToVideo?: boolean,
  callType?: string,
  timestamp?: string
}

export const sendAudioVideoFCMNotification = async (receiverId: string, message: IChatMessage, userRole: string) => {
  try {
    const authServiceBaseURL = process.env.AUTH_SERVICE_BASE_URL!;
    const fcmServiceBaseURL = process.env.FCM_SERVICE_BASE_URL!;
    const internalApiKey = process.env.INTERNAL_API_KEY!;

    // fetch fcm tokens from auth service (kept same as before)
    const { data: userResponse } = await axios.post(
      `${authServiceBaseURL}/api/v1/profile/get-fcm-by-phone`,
      { phone: receiverId, role: userRole },
      { headers: { "x-internal-api-key": internalApiKey } },
    );

    const { data: voipResponse } = await axios.post(
      `${authServiceBaseURL}/api/v1/profile/get-voip-by-phone`,
      { phone: receiverId, role: userRole },
      { headers: { "x-internal-api-key": internalApiKey } },
    );

    const fcmTokens: string[] = userResponse?.data?.token || [];
    const voipTokens: string[] = voipResponse?.data?.token || [];
    const deviceType: string = userResponse?.data?.device_type || voipResponse?.data?.device_type || "android";
    const app_code: string = userResponse?.data?.app_code || voipResponse?.data?.app_code || "SP_MAIN";
    const role: string = userResponse?.data?.role || voipResponse?.data?.role || "individual";

    if (!fcmTokens.length && !voipTokens.length) {
      console.info(`⚠️ No FCM or VoIP tokens found for user ${receiverId}`);
      return { sent: false, message: "No FCM or VoIP tokens found" };
    }

    // remove falsy/duplicate tokens
    let uniqueTokens = [];
    if (deviceType === "ios") {
      uniqueTokens = Array.from(new Set(voipTokens.filter(Boolean)));
    } else {
      uniqueTokens = Array.from(new Set(fcmTokens.filter(Boolean)));
    }

    const title = `${message.fromm}`;
    // Audio and video share the "video" flow, so the text comes from callType
    const kind = message.callType === "audio" ? "audio" : "video";
    const body = message.messageType.startsWith("group") ? `Incoming group ${kind} call` : `Incoming ${kind} call`;

    // prepare payloads
    const payloads = uniqueTokens.map((token) => ({
      token,
      data: {
        screen: `${message.messageType}_screen`,
        type: `${message.messageType}_call`,
        fromm: message.fromm,
        to: message.to,
        messageId: message.messageId,
        messageType: message.messageType,
        conversationId: message.conversationId,
        bookingId: message.bookingId,
        callId: message.callId,
        offer: message.offer,
        offerType: message.offerType,
        isIncoming: message.isIncoming,
        switchToVideo: message.switchToVideo,
        callType: message.callType,
        timestamp: message.timestamp,
        app_code,
        role,
      },
      android: { priority: "high", ttl: 0 }, // for 30 sec
      apns: {
        headers: { "apns-priority": "10", "apns-expiration":"0" }, // for 0 sec
        payload: {
          aps: {
            alert: { title, body },
            sound: "default",
            "content-available": 1,
          },
        },
      },
      device_type: deviceType,
    }));

    let successCount = 0;
    // we will collect tokens that appear invalid and attempt to remove them afterwards
    const tokensToRemove: string[] = [];

    // list of substrings that indicate an invalid/expired token (lowercase checks)
    const invalidTokenIndicators = [
      "not-registered",
      "not registered",
      "invalidregistration",
      "invalid-registration-token",
      "invalid-registration-token",
      "invalid-registration",
      "invalid token",
      "messaging/invalid-registration-token",
      "messaging/registration-token-not-registered",
      "registration-token-not-registered",
      "not a valid fcm registration token",
      "not a valid registration token",
      "unregistered",
    ];

    // send notifications in parallel; each payload's errors are handled locally
    await Promise.all(
      payloads.map(async (payload) => {
        try {
          await axios.post(`${fcmServiceBaseURL}/api/v1/fcm/send`, payload, {
            headers: { "x-internal-api-key": internalApiKey },
          });
          successCount++;
        } catch (err: any) {
          // Robust error extraction
          const respData = err?.response?.data;
          let errorMsg = "";

          if (respData) {
            if (typeof respData === "string") {
              errorMsg = respData;
            } else if (respData.error) {
              if (typeof respData.error === "string") errorMsg = respData.error;
              else errorMsg = respData.error.message || JSON.stringify(respData.error);
            } else if (respData.message) {
              errorMsg = respData.message;
            } else {
              // fallback stringify
              try {
                errorMsg = JSON.stringify(respData);
              } catch {
                errorMsg = String(respData);
              }
            }
          } else {
            errorMsg = err?.message || String(err);
          }

          const errorMsgStr = String(errorMsg);
          console.error(`❌ FCM send failed: ${errorMsgStr}`);

          const lower = errorMsgStr.toLowerCase();

          // If it looks like an invalid/expired token — queue it for removal
          const isInvalidToken = invalidTokenIndicators.some((ind) => lower.includes(ind));
          if (isInvalidToken) {
            console.info(
              `🗑 Marking invalid FCM token for removal for user ${receiverId}: ${payload.token}`,
            );
            tokensToRemove.push(payload.token);
          } else {
            // unexpected error — keep logs for investigation
            console.error("❌ FCM send failed (unhandled case):", errorMsgStr);
          }
        }
      }),
    );

    // Attempt to remove all invalid tokens we discovered (in parallel, but tally success)
    let removedCount = 0;
    if (tokensToRemove.length) {
      const removeResults = await Promise.allSettled(
        tokensToRemove.map((token) =>
          axios.post(
            `${authServiceBaseURL}/api/v1/profile/remove-fcm-token`,
            { phone: receiverId, token },
            { headers: { "x-internal-api-key": internalApiKey } },
          ),
        ),
      );

      removeResults.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          // assume 2xx => removed (auth-service returns 200 on successful removal)
          removedCount++;
          console.info(`✅ Removed invalid token for user ${receiverId}: ${tokensToRemove[idx]}`);
        } else {
          // log rejection reason but don't throw
          console.info(
            `⚠️ Failed to remove token ${tokensToRemove[idx]} for user ${receiverId}:`,
            r.status === "rejected" ? r.reason : r,
          );
        }
      });
    }

    console.info(
      `📲 Chat FCM summary from ${message.fromm} to user ${receiverId}: sent=${successCount}, removed=${removedCount}, total=${uniqueTokens.length}`,
    );

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
