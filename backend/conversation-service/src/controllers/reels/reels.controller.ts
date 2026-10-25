import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { IReel, Reel } from "../../models/reelModal/reel.model";
import { Follow } from "../../models/reelModal/follow.model";
import { ReelLike } from "../../models/reelModal/reelLike.model";
import { ReelComment } from "../../models/reelModal/reelComment.model";
import AllFriendsContact from "../../models/contactModal/allFriendsContact.model";
import {
  deleteR2Object,
  headR2Object,
  keyFromPublicUrl,
  presignedReelUploadR2,
  reelKeyPrefix,
  REEL_MEDIA_TYPES,
} from "../../utils/r2Upload";
import { beforeCursor, canViewReels, getProfiles, PAGE_SIZE, PHONE_PATTERN } from "../../utils/social";

const MAX_REEL_BYTES = 200 * 1024 * 1024; // videos
const MAX_PHOTO_BYTES = 100 * 1024 * 1024;
const MAX_CAPTION = 2200;

const toReelResponse = (reel: IReel, profiles: Map<string, any>, me: string, likedByMe = false) => ({
  _id: String(reel._id),
  type: reel.type ?? "video",
  mediaUrl: reel.videoUrl,
  videoUrl: reel.videoUrl, // older app versions read this
  caption: reel.caption,
  duration: reel.duration ?? null,
  createdAt: reel.createdAt,
  author: profiles.get(reel.author),
  isMine: reel.author === me,
  likeCount: reel.likeCount ?? 0,
  commentCount: reel.commentCount ?? 0,
  shareCount: reel.shareCount ?? 0,
  likedByMe,
});

const page = async (reels: IReel[], me: string) => {
  // Profiles and "did I like these" in parallel: two queries per page, whatever its size
  const [profiles, liked] = await Promise.all([
    getProfiles(reels.map((r) => r.author)),
    reels.length
      ? ReelLike.find({ user: me, reel: { $in: reels.map((r) => r._id) } }).select("reel").lean()
      : Promise.resolve([] as { reel: unknown }[]),
  ]);
  const likedIds = new Set(liked.map((l: any) => String(l.reel)));
  return {
    reels: reels.map((r) => toReelResponse(r, profiles, me, likedIds.has(String(r._id)))),
    nextCursor: reels.length === PAGE_SIZE ? String(reels[reels.length - 1]._id) : null,
  };
};

/** POST /reels/upload-url { mediaType } — step 1: the app uploads the video or photo straight to R2. */
export const getReelUploadUrl = asyncHandler(async (req: Request, res: Response) => {
  const { mediaType } = req.body;
  if (!REEL_MEDIA_TYPES[mediaType])
    return new ApiResponse(400, null, `Unsupported file type. Use ${Object.keys(REEL_MEDIA_TYPES).join(", ")}`);
  const { uploadUrl, fileUrl } = await presignedReelUploadR2(String(req.user.phone), mediaType);
  const maxBytes = String(mediaType).startsWith("image/") ? MAX_PHOTO_BYTES : MAX_REEL_BYTES;
  return new ApiResponse(200, { uploadUrl, fileUrl, maxBytes }, "Upload URL created");
});

/** POST /reels { fileUrl, caption, duration } — step 2: publish the uploaded video or photo. */
export const createReel = asyncHandler(async (req: Request, res: Response) => {
  const me = String(req.user.phone);
  const { fileUrl, caption = "", duration } = req.body;

  const key = typeof fileUrl === "string" ? keyFromPublicUrl(fileUrl) : null;
  if (!key || !key.startsWith(reelKeyPrefix(me))) return new ApiResponse(400, null, "Invalid fileUrl");
  if (typeof caption !== "string" || caption.length > MAX_CAPTION)
    return new ApiResponse(400, null, `Caption must be at most ${MAX_CAPTION} characters`);

  // The presigned URL can't cap the size, so check what actually arrived in the bucket
  const object = await headR2Object(key);
  if (!object) return new ApiResponse(400, null, "File not uploaded yet");
  const type = object.contentType.startsWith("image/") ? "image" : object.contentType.startsWith("video/") ? "video" : null;
  const tooBig = type === "image" ? object.size > MAX_PHOTO_BYTES : object.size > MAX_REEL_BYTES;
  if (!type || !REEL_MEDIA_TYPES[object.contentType] || tooBig) {
    await deleteR2Object(key).catch((e) => console.error("delete rejected reel upload failed", e));
    return new ApiResponse(400, null, "Reels must be a video of at most 200 MB or a photo of at most 100 MB");
  }
  if (await Reel.exists({ key })) return new ApiResponse(409, null, "This file is already posted");

  const reel = await Reel.create({
    author: me,
    type,
    videoUrl: fileUrl,
    key,
    caption: caption.trim(),
    duration: type === "video" && Number.isFinite(Number(duration)) ? Math.round(Number(duration)) : undefined,
    size: object.size,
  });
  const profiles = await getProfiles([me]);
  return new ApiResponse(201, { reel: toReelResponse(reel, profiles, me) }, "Reel posted");
});

/** GET /reels/feed?before=<reelId> — reels from people I follow, plus my own, newest first. */
export const getFeed = asyncHandler(async (req: Request, res: Response) => {
  const me = String(req.user.phone);
  const following: string[] = await Follow.find({ follower: me }).distinct("following");

  // Skip authors who have since blocked me
  const blockedMe: string[] = following.length
    ? await AllFriendsContact.find({ phone: { $in: following }, blockedPhones: Number(me) }).distinct("phone")
    : [];
  const authors = [me, ...following.filter((p) => !blockedMe.includes(p))];

  const reels = await Reel.find({ author: { $in: authors }, ...beforeCursor(req.query.before) })
    .sort({ _id: -1 })
    .limit(PAGE_SIZE)
    .lean<IReel[]>();
  return new ApiResponse(200, await page(reels, me), "Feed fetched");
});

/** GET /reels/user/:phone?before=<reelId> — one person's reels (followers only). */
export const getUserReels = asyncHandler(async (req: Request, res: Response) => {
  const me = String(req.user.phone);
  const phone = req.params.phone;
  if (!PHONE_PATTERN.test(phone)) return new ApiResponse(400, null, "Invalid phone");
  if (!(await canViewReels(me, phone))) return new ApiResponse(403, null, "Follow this user to see their reels");

  const reels = await Reel.find({ author: phone, ...beforeCursor(req.query.before) })
    .sort({ _id: -1 })
    .limit(PAGE_SIZE)
    .lean<IReel[]>();
  return new ApiResponse(200, await page(reels, me), "Reels fetched");
});

/** DELETE /reels/:id — authors can delete their own reels. */
export const deleteReel = asyncHandler(async (req: Request, res: Response) => {
  const reel = await Reel.findOne({ _id: req.params.id, author: String(req.user.phone) }).catch(() => null);
  if (!reel) return new ApiResponse(404, null, "Reel not found");

  await reel.deleteOne();
  await Promise.all([
    ReelLike.deleteMany({ reel: reel._id }),
    ReelComment.deleteMany({ reel: reel._id }),
    deleteR2Object(reel.key).catch((e) => console.error("delete reel video failed", e)),
  ]);
  return new ApiResponse(200, null, "Reel deleted");
});
