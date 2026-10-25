import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { User } from "../models/user.model";
import { Session } from "../models/session.model";

// Service-to-service endpoints (x-internal-api-key). Shapes match what
// conversation-service's auth/FCM/block clients already read.

/** POST /auth/get-users-by-phones { phones } → registered users among those phones */
export const getUsersByPhones = asyncHandler(async (req: Request, res: Response) => {
  const phones = [...new Set((req.body.phones as (string | number)[]).map((p) => String(p).replace(/\D/g, "")))];
  const users = await User.find({ phone: { $in: phones } })
    .select("phone username first_name last_name about profile_image email")
    .lean();
  return new ApiResponse(200, users, "Users fetched");
});

const pushTargets = async (phone: string, field: "fcmToken" | "voipToken") => {
  const user = await User.findOne({ phone }).select("role").lean();
  const sessions = await Session.find({ phone, [field]: { $exists: true } })
    .sort({ updatedAt: -1 })
    .select(`${field} deviceType appCode`)
    .lean();
  return {
    token: sessions.map((s) => s[field] as string),
    device_type: sessions[0]?.deviceType ?? "android",
    app_code: sessions[0]?.appCode ?? "SP_MAIN",
    role: user?.role ?? "individual",
  };
};

/** POST /profile/get-fcm-by-phone { phone } */
export const getFcmByPhone = asyncHandler(async (req: Request, res: Response) => {
  return new ApiResponse(200, await pushTargets(req.body.phone, "fcmToken"), "FCM tokens fetched");
});

/** POST /profile/get-voip-by-phone { phone } */
export const getVoipByPhone = asyncHandler(async (req: Request, res: Response) => {
  return new ApiResponse(200, await pushTargets(req.body.phone, "voipToken"), "VoIP tokens fetched");
});

/** POST /profile/remove-fcm-token { phone, token } — FCM/APNs reported the token as dead */
export const removePushToken = asyncHandler(async (req: Request, res: Response) => {
  const { phone, token } = req.body;
  await Session.updateMany({ phone, fcmToken: token }, { $unset: { fcmToken: 1 } });
  await Session.updateMany({ phone, voipToken: token }, { $unset: { voipToken: 1 } });
  return new ApiResponse(200, null, "Token removed");
});

/** POST /profile/block-contact { userPhone, contactNo } */
export const blockContact = asyncHandler(async (req: Request, res: Response) => {
  const { userPhone, contactNo } = req.body;
  if (userPhone === contactNo) return new ApiResponse(400, null, "You can't block yourself");
  const { matchedCount } = await User.updateOne({ phone: userPhone }, { $addToSet: { blockedPhones: contactNo } });
  if (!matchedCount) return new ApiResponse(404, null, "User not found");
  return new ApiResponse(200, null, "User blocked successfully");
});

/** POST /profile/unblock-contact { userPhone, contactNo } */
export const unblockContact = asyncHandler(async (req: Request, res: Response) => {
  const { userPhone, contactNo } = req.body;
  const { matchedCount } = await User.updateOne({ phone: userPhone }, { $pull: { blockedPhones: contactNo } });
  if (!matchedCount) return new ApiResponse(404, null, "User not found");
  return new ApiResponse(200, null, "User unblocked successfully");
});
