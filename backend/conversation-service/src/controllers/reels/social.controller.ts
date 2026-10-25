import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { Follow } from "../../models/reelModal/follow.model";
import { Reel } from "../../models/reelModal/reel.model";
import { getProfiles, hasBlocked, isFollowing, PHONE_PATTERN } from "../../utils/social";
import { getUsersByPhones } from "../../services/auth/phone.service";

/** POST /social/follow/:phone */
export const follow = asyncHandler(async (req: Request, res: Response) => {
  const me = String(req.user.phone);
  const target = req.params.phone;
  if (!PHONE_PATTERN.test(target)) return new ApiResponse(400, null, "Invalid phone");
  if (target === me) return new ApiResponse(400, null, "You can't follow yourself");

  // Only registered users, and not someone who blocked you
  const [user] = await getUsersByPhones([target]);
  if (!user || (await hasBlocked(target, me))) return new ApiResponse(404, null, "User not found");

  await Follow.updateOne({ follower: me, following: target }, { $setOnInsert: { follower: me, following: target } }, { upsert: true });
  return new ApiResponse(200, { isFollowing: true }, "Following");
});

/** DELETE /social/follow/:phone */
export const unfollow = asyncHandler(async (req: Request, res: Response) => {
  await Follow.deleteOne({ follower: String(req.user.phone), following: req.params.phone });
  return new ApiResponse(200, { isFollowing: false }, "Unfollowed");
});

/** GET /social/profile/:phone — header of a reels profile: who, counts, follow state. */
export const getSocialProfile = asyncHandler(async (req: Request, res: Response) => {
  const me = String(req.user.phone);
  const phone = req.params.phone;
  if (!PHONE_PATTERN.test(phone)) return new ApiResponse(400, null, "Invalid phone");

  const isMe = phone === me;
  if (!isMe && (await hasBlocked(phone, me))) return new ApiResponse(404, null, "User not found");

  const [profiles, followers, following, reels, followingThem] = await Promise.all([
    getProfiles([phone]),
    Follow.countDocuments({ following: phone }),
    Follow.countDocuments({ follower: phone }),
    Reel.countDocuments({ author: phone }),
    isMe ? Promise.resolve(false) : isFollowing(me, phone),
  ]);

  return new ApiResponse(200, {
    user: profiles.get(phone),
    counts: { reels, followers, following },
    isMe,
    isFollowing: followingThem,
    canViewReels: isMe || followingThem,
  }, "Profile fetched");
});
