import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";
import { toSelf, User } from "../models/user.model";
import { Session } from "../models/session.model";
import { checkOtp, consumeOtp, sendOtp } from "../services/otp.service";
import { createSession, reissueAccessToken, rotateRefreshToken } from "../services/token.service";
import { notifyNewLogin } from "../services/conversation.service";

const isDuplicateKey = (err: any) => err?.code === 11000;

/** POST /auth/generate-otp — step 1 of both sign-up and login. */
export const generateOtp = asyncHandler(async (req: Request, res: Response) => {
  await sendOtp(req.body.phone);
  return new ApiResponse(200, { phone: req.body.phone }, "OTP sent");
});

/**
 * POST /auth/verify-otp — step 2. Creates the account on first login.
 * Only one device may be signed in: another device gets 409 unless forceLogin is set,
 * in which case the other devices are signed out.
 */
export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone, otp, deviceId, fcm_token, voip_token, device_type, appName, forceLogin } = req.body;

  await checkOtp(phone, otp);

  const user = await User.findOneAndUpdate(
    { phone },
    { $setOnInsert: { phone } },
    { upsert: true, new: true },
  );

  const otherDevices = await Session.countDocuments({ userId: user._id, deviceId: { $ne: deviceId } });
  if (otherDevices > 0) {
    if (!forceLogin) {
      notifyNewLogin(phone, false, deviceId, appName);
      throw new ApiError("This account is active on another device. Log in anyway to sign it out.", 409);
    }
    await Session.deleteMany({ userId: user._id, deviceId: { $ne: deviceId } });
    notifyNewLogin(phone, true, deviceId, appName);
  }

  // A push token belongs to one device: drop it from any other account that still has it
  if (fcm_token) await Session.updateMany({ fcmToken: fcm_token, userId: { $ne: user._id } }, { $unset: { fcmToken: 1 } });
  if (voip_token) await Session.updateMany({ voipToken: voip_token, userId: { $ne: user._id } }, { $unset: { voipToken: 1 } });

  const { accessToken, refreshToken } = await createSession(user, {
    deviceId,
    fcmToken: fcm_token,
    voipToken: voip_token,
    deviceType: device_type,
    appCode: appName,
  });
  await consumeOtp(phone);

  return new ApiResponse(200, {
    accessToken,
    refreshToken,
    isNewUser: !user.username, // true → app should show the "choose a username" screen
    user: toSelf(user),
  }, "Logged in successfully");
});

/** POST /auth/register — completes sign-up by choosing a username and name. */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { username, first_name, last_name } = req.body;
  const user = await User.findById(req.user!._id);
  if (!user) throw new ApiError("User not found", 404);
  if (user.username) throw new ApiError("Already registered. Use PATCH /profile/username to change your username.", 409);

  user.username = username;
  user.usernameChangedAt = new Date();
  user.first_name = first_name;
  user.last_name = last_name;
  try {
    await user.save();
  } catch (err) {
    if (isDuplicateKey(err)) throw new ApiError("This username is taken", 409);
    throw err;
  }

  // The access token carries the username, so hand back one that has it
  const accessToken = reissueAccessToken(user, req.user!.sid);
  return new ApiResponse(201, { accessToken, user: toSelf(user) }, "Registration completed");
});

/** GET /auth/username-available?username=... */
export const usernameAvailable = asyncHandler(async (req: Request, res: Response) => {
  const username = String(req.query.username);
  const taken = await User.exists({ username, _id: { $ne: req.user!._id } });
  return new ApiResponse(200, { username, available: !taken }, taken ? "Username is taken" : "Username is available");
});

/** GET /auth/verify-user — the signed-in user's profile (the app calls this right after login). */
export const verifyUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!._id);
  if (!user) throw new ApiError("User not found", 404);
  return new ApiResponse(200, { user: toSelf(user) }, "User verified");
});

/** POST /auth/get-new-access-token */
export const refreshAccessToken = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await rotateRefreshToken(req.body.refreshToken);
  return new ApiResponse(200, tokens, "Token refreshed");
});

/** POST /auth/logout — ends this device's session (and its push tokens with it). */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  await Session.deleteOne({ _id: req.user!.sid });
  return new ApiResponse(200, null, "Logged out");
});
