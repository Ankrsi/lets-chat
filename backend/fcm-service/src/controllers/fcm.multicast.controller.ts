import { Request, Response } from "express";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/apiError";
import { sendMulticastNotificationService } from "../services/fcmMulticast.service";

export const sendMulticastNotification = asyncHandler(async (req: Request, res: Response) => {
  const { devices, notification, data, android, apns } = req.body;

  if (!Array.isArray(devices) || devices.length === 0) {
    throw new ApiError("Devices array is required", 400);
  }
  if (!notification && (!data || Object.keys(data).length === 0)) {
    throw new ApiError("Either notification or data payload is required", 400);
  }


  const result = await sendMulticastNotificationService({
    devices,
    notification,
    data,
    android,
    apns,
  });

  // 🚀 Instead of throwing, return both successes and failures
  return new ApiResponse(
    200,
    result,
    "FCM multicast attempted (check successCount & failureCount)",
  );
});
