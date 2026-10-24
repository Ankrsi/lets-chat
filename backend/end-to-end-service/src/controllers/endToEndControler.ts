import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { PreKeyModel } from "../modals/preKeys.modal";
import { PubPrivKeyModel } from "../modals/pubPrivKeys.modal";
import { GroupKeysBackupModel } from "../modals/groupKeysBackup.modal";

export const setPubKeyControler = asyncHandler(async (req, res) => {
  if (!req.user) return new ApiResponse(401, null, "user not forund");
  const { publicKey } = req.body;
  if (!publicKey) return new ApiResponse(400, null, "data missing");

  // const preKey = await PreKeyModel.findOneAndUpdate(
  //   { phone: String(req.user.phone) },
  //   { userId: req.user._id, publicKey },
  //   { upsert: true, new: true }
  // );

  const preKey = await PreKeyModel.findOneAndUpdate(
    { phone: String(req.user.phone) },
    {
      $set: {
        userId: req.user._id,
        publicKey
      },
      $setOnInsert: {
        phone: String(req.user.phone)
      }
    },
    { upsert: true, new: true }
  );

  if (!preKey) return new ApiResponse(404, null, "data not found or failed to save in db");

  return new ApiResponse(200, { status: true }, "keys save to db");
});

export const getPubKeyControler = asyncHandler(async (req, res) => {
  if (!req.user) return new ApiResponse(401, null, "user not found");

  const preKey = await PreKeyModel.findOne({ phone: req.params.phone });
  if (!preKey) return new ApiResponse(404, null, "data not found");

  return new ApiResponse(200, { publicKey: preKey.publicKey }, "found keys successfully");
});

export const getGroupMembersKeysControler = asyncHandler(async (req, res) => {
  if (!req.user) return new ApiResponse(401, null, "user not found");

  const { members } = req.body;

  if (!members || !Array.isArray(members) || members.length === 0) {
    return new ApiResponse(400, null, "members data is invalid or not an array");
  }

  const preKeys = await PreKeyModel.find({ phone: { $in: members } });
  if (!preKeys.length) return new ApiResponse(404, null, "no keys found");

  const keys = Object.fromEntries(
    preKeys.map(({ phone, publicKey }) => [phone, publicKey])
  );

  return new ApiResponse(200, keys, "found keys successfully");
});

export const setPubPrivKeysControler = asyncHandler(async (req, res) => {
  if (!req.user) return new ApiResponse(401, null, "user not forund");
  const { keys } = req.body;

  const oldPreKey = await PubPrivKeyModel.findOne({ phone: String(req.user.phone) });

  const day = 30 * 24 * 60 * 60 * 1000;
  if (oldPreKey && (Date.now() - oldPreKey.updatedAt.getTime()) < day) {
    return new ApiResponse(200, { status: false, keys: oldPreKey.keys }, "you can only update your keys after 30 days of last update");
  }

  if (!keys) return new ApiResponse(400, null, "data missing");

  const preKey = await PubPrivKeyModel.findOneAndUpdate(
    { phone: String(req.user.phone) },
    {
      $set: {
        userId: req.user._id,
        keys
      },
      $setOnInsert: {
        phone: String(req.user.phone)
      }
    },
    { upsert: true, new: true }
  );

  if (!preKey) return new ApiResponse(404, null, "data not found or failed to save in db");

  return new ApiResponse(200, { status: true }, "keys save to db");
});

export const getPubPrivKeysControler = asyncHandler(async (req, res) => {
  if (!req.user) return new ApiResponse(401, null, "user not forund");

  const preKey = await PubPrivKeyModel.findOne({ phone: req.params.phone });
  if (!preKey) return new ApiResponse(404, null, "data not found");
  return new ApiResponse(200, { keys: preKey.keys }, "found keys successfully");
});
export const setGroupKeyBackupControler = asyncHandler(async (req, res) => {
  if (!req.user) return new ApiResponse(401, null, "user not found");
  const { encryptedGroupKey, conversationId } = req.body;
  if (!encryptedGroupKey) return new ApiResponse(400, null, "data missing");

  const groupKeysBackup = await GroupKeysBackupModel.findOneAndUpdate(
    { conversationId, phone: String(req.user.phone) },
    {
      $set: { encryptedGroupKey, userId: req.user._id },
      $setOnInsert: { conversationId, phone: String(req.user.phone) }
    },
    { new: true, upsert: true }
  );
  if (!groupKeysBackup) return new ApiResponse(404, null, "data not found or failed to save in db");

  return new ApiResponse(200, null, "group key backup save to db");
});

export const getGroupKeyBackupControler = asyncHandler(async (req, res) => {
  if (!req.user) return new ApiResponse(401, null, "user not found");
  const groupKeysBackup = await GroupKeysBackupModel.find({ phone: String(req.user.phone) });
  if (!groupKeysBackup) return new ApiResponse(404, null, "data not found");

  return new ApiResponse(200, groupKeysBackup, "found group key backup successfully");
});
