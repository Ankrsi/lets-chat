import { Request, Response } from "express";
import { sendMessageToDevice, sendToDevices } from "../utils/fcmSender";
import { asyncHandler } from "../utils/asyncHandler";
import { sendVoipsToDevice, sendVoipToDevice } from "../utils/voipSender";
import { ApiResponse } from "../utils/apiResponse";

export const sendNotification = asyncHandler(async (req: Request, res: Response) => {
  const { token, notification, data, device_type, android, apns } = req.body;
  if (!token || !device_type || (!notification && !data)) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    if (device_type == 'ios' &&
      ['audio_screen', 'video_screen', 'group_audio_screen', 'group_video_screen'].includes(data.screen) &&
      ['audio_call', 'video_call', 'group_audio_call', 'group_video_call'].includes(data.type)) {

      const result = await sendVoipToDevice({
        token,
        data
      });

      if (!result || result.failed.length > 0) {
        console.info(result?.failed);
        return new ApiResponse(500, {
          success: false,
          message: "Failed to send VoIP notification.",
          fcmResponse: result,
        }, "Failed to send VoIP notification.");
      }
      return new ApiResponse(200, {
        success: true,
        message: "VoIP notification sent successfully.",
        fcmResponse: Array.isArray(result) ? result[0] : result,
      }, "VoIP notification sent successfully.");
    }
    else {
      const result = await sendMessageToDevice({
        token,
        notification,
        data,
        device_type,
        android,
        apns,
      });
      return new ApiResponse(200, {
        success: true,
        message: "Notification sent successfully.",
        fcmResponse: result,
      }, "Notification sent successfully.");

    }
  } catch (error: any) {
    console.error("FCM Error:", error.code, error.message);
    return new ApiResponse(500, {
      success: false,
      message: "Failed to send notification.",
      error: error.message,
    }, "Failed to send notification.");
  }
});

export const sendMultiNotification = asyncHandler(async (req: Request, res: Response) => {
  const { receiverPhone, user_id, tokens, notification, data, device_type, android, apns, webpush } = req.body;
  if ((!receiverPhone && !user_id) || !tokens || !Array.isArray(tokens) || !device_type || (!notification && !data)) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    if (device_type == 'ios' &&
      ['audio_screen', 'video_screen'].includes(data.screen) &&
      ['audio_call', 'video_call'].includes(data.type)) {

      const result = await sendVoipsToDevice({
        tokens,
        data
      });

      if (!result || result.failed.length > 0) {
        return new ApiResponse(500, {
          success: false,
          message: "Failed to send VoIP notification.",
          fcmResponse: result,
        }, "Failed to send VoIP notification.");
      }
      return new ApiResponse(200, {
        success: true,
        message: "VoIP notification sent successfully.",
        fcmResponse: result,
      }, "VoIP notification sent successfully.");
    }
    else {
      const result = await sendToDevices({
        tokens,
        notification,
        data,
        device_type,
        android,
        apns,
        webpush
      });

      return new ApiResponse(200, {
        success: true,
        message: "Notification sent successfully.",
        fcmResponse: result,
      }, "Notification sent successfully.");

    }
  } catch (error: any) {
    console.error("FCM Error:", error.code, error.message);
    return new ApiResponse(500, {
      success: false,
      message: "Failed to send notification.",
      error: error.message,
    }, "Failed to send notification.");
  }
});
