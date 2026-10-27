import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";
import { toPublic, toSelf, User } from "../models/user.model";
import { Session } from "../models/session.model";
import { uploadProfileImage } from "../utils/r2Upload";
import { reissueAccessToken } from "../services/token.service";
import { notifyProfileChanged } from "../services/conversation.service";

const findMe = async (req: Request) => {
  const user = await User.findById(req.user!._id);
  if (!user) throw new ApiError("User not found", 404);
  return user;
};

export const getMyProfile = asyncHandler(async (req: Request, res: Response) => {
  return new ApiResponse(200, { user: toSelf(await findMe(req)) }, "Profile fetched");
});

export const updateMyProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await findMe(req);
  const { first_name, last_name, about, email } = req.body;

  if (first_name !== undefined) user.first_name = first_name;
  if (last_name !== undefined) user.last_name = last_name;
  if (about !== undefined) user.about = about;
  if (email !== undefined) user.email = email || undefined; // "" or null removes it
  await user.save();

  notifyProfileChanged(user.phone);
  return new ApiResponse(200, { user: toSelf(user) }, "Profile updated");
});

export const changeUsername = asyncHandler(async (req: Request, res: Response) => {
  const user = await findMe(req);
  const { username } = req.body;
  if (user.username === username) throw new ApiError("That is already your username", 400);

  user.username = username;
  user.usernameChangedAt = new Date();
  try {
    await user.save();
  } catch (err: any) {
    if (err?.code === 11000) throw new ApiError("This username is taken", 409);
    throw err;
  }

  notifyProfileChanged(user.phone);
  // The access token carries the username, so hand back one with the new value
  const accessToken = reissueAccessToken(user, req.user!.sid);
  return new ApiResponse(200, { accessToken, user: toSelf(user) }, "Username updated");
});

export const updateProfileImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError("profile_image file is required", 400);
  const user = await findMe(req);

  user.profile_image = await uploadProfileImage(String(user._id), req.file);
  await user.save();

  notifyProfileChanged(user.phone);
  return new ApiResponse(200, { user: toSelf(user) }, "Profile image updated");
});

export const removeProfileImage = asyncHandler(async (req: Request, res: Response) => {
  const user = await findMe(req);
  user.profile_image = undefined;
  await user.save();

  notifyProfileChanged(user.phone);
  return new ApiResponse(200, { user: toSelf(user) }, "Profile image removed");
});

export const getUserByUsername = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findOne({ username: req.params.username });
  // Users who blocked the requester look the same as users that don't exist
  if (!user || user.blockedPhones.includes(req.user!.phone)) throw new ApiError("User not found", 404);
  return new ApiResponse(200, { user: toPublic(user) }, "User found");
});

export const updateDeviceTokens = asyncHandler(async (req: Request, res: Response) => {
  const { fcm_token, voip_token } = req.body;
  const $set: Record<string, string> = {};
  const $unset: Record<string, 1> = {};

  if (fcm_token) $set.fcmToken = fcm_token;
  else if (fcm_token === null) $unset.fcmToken = 1;
  if (voip_token) $set.voipToken = voip_token;
  else if (voip_token === null) $unset.voipToken = 1;

  // A push token belongs to one device: drop it from any other session that still has it
  if (fcm_token) await Session.updateMany({ fcmToken: fcm_token, _id: { $ne: req.user!.sid } }, { $unset: { fcmToken: 1 } });
  if (voip_token) await Session.updateMany({ voipToken: voip_token, _id: { $ne: req.user!.sid } }, { $unset: { voipToken: 1 } });

  await Session.updateOne({ _id: req.user!.sid }, { $set, $unset });
  return new ApiResponse(200, null, "Device tokens updated");
});
