import crypto from "crypto";
import { promisify } from "util";
import { Types } from "mongoose";
import { User } from "../models/user.model";
import { ApiError } from "../utils/apiError";

// Two-step verification: a 6-digit code the user picks, asked after the OTP at login.
// Stored as "salt:scrypt-hash"; 5 wrong tries lock it for an hour.
const scrypt = promisify(crypto.scrypt) as (pin: string, salt: string, keylen: number) => Promise<Buffer>;
const MAX_TRIES = 5;
const LOCK_MS = 60 * 60 * 1000;

export const hashPin = async (pin: string) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(pin, salt, 32);
  return `${salt}:${hash.toString("hex")}`;
};

const matches = async (pin: string, stored: string) => {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = await scrypt(pin, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
};

const lockedError = () => new ApiError("Too many wrong codes. Try again in 60 min.", 429);

/** Throws unless `pin` is the user's code. Counts wrong tries and locks after too many. */
export const checkPin = async (userId: Types.ObjectId | string, pin: string) => {
  const user = await User.findById(userId).select("+twoStepPinHash");
  if (!user?.twoStepPinHash) return;

  // Count this try before comparing, in one atomic step: many guesses sent at once
  // can't all slip in under the limit
  const now = new Date();
  const counted = await User.findOneAndUpdate(
    {
      _id: user._id,
      twoStepFailed: { $lt: MAX_TRIES },
      $or: [{ twoStepLockedUntil: null }, { twoStepLockedUntil: { $lte: now } }],
    },
    { $inc: { twoStepFailed: 1 } },
    { new: true },
  );
  if (!counted) throw lockedError();

  if (await matches(pin, user.twoStepPinHash)) {
    await User.updateOne({ _id: user._id }, { $set: { twoStepFailed: 0 }, $unset: { twoStepLockedUntil: 1 } });
    return;
  }

  const failed = counted.twoStepFailed ?? MAX_TRIES;
  if (failed >= MAX_TRIES) {
    await User.updateOne({ _id: user._id }, { $set: { twoStepFailed: 0, twoStepLockedUntil: new Date(Date.now() + LOCK_MS) } });
    throw lockedError();
  }
  throw new ApiError(`Wrong code. ${MAX_TRIES - failed} tries left.`, 401);
};
