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
const MAX_PHOTOS = 10;

const toReelResponse = (reel: IReel, profiles: Map<string, any>, me: string, likedByMe = false) => ({
  _id: String(reel._id),
  type: reel.type ?? "video",
  mediaUrl: reel.videoUrl,
  videoUrl: reel.videoUrl, // older app versions read this
  caption: reel.caption,
  duration: reel.duration ?? null,
  // Every photo of a photo reel, swiped left to right (one entry for a single photo)
  photos: reel.photos?.length ? reel.photos.map((p) => p.url) : reel.type === "image" ? [reel.videoUrl] : null,
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

export const getReelUploadUrl = asyncHandler(async (req: Request, res: Response) => {
  const { mediaType } = req.body;
  if (!REEL_MEDIA_TYPES[mediaType])
    return new ApiResponse(400, null, `Unsupported file type. Use ${Object.keys(REEL_MEDIA_TYPES).join(", ")}`);
  const { uploadUrl, fileUrl } = await presignedReelUploadR2(String(req.user.phone), mediaType);
  const maxBytes = String(mediaType).startsWith("image/") ? MAX_PHOTO_BYTES : MAX_REEL_BYTES;
  return new ApiResponse(200, { uploadUrl, fileUrl, maxBytes }, "Upload URL created");
});

const discard = (keys: string[]) =>
  Promise.all(keys.map((k) => deleteR2Object(k).catch((e) => console.error("delete rejected reel upload failed", e))));

export const createReel = asyncHandler(async (req: Request, res: Response) => {
  const me = String(req.user.phone);
  const { fileUrl, fileUrls, caption = "", duration } = req.body;

  const urls: unknown[] = Array.isArray(fileUrls) ? fileUrls : [fileUrl];
  if (!urls.length || urls.length > MAX_PHOTOS) return new ApiResponse(400, null, `A reel can have 1 to ${MAX_PHOTOS} photos`);
  const keys = urls.map((u) => (typeof u === "string" ? keyFromPublicUrl(u) : null));
  if (keys.some((k) => !k || !k.startsWith(reelKeyPrefix(me))) || new Set(keys).size !== keys.length)
    return new ApiResponse(400, null, "Invalid fileUrl");
  if (typeof caption !== "string" || caption.length > MAX_CAPTION)
    return new ApiResponse(400, null, `Caption must be at most ${MAX_CAPTION} characters`);

  // The presigned URL can't cap the size, so check what actually arrived in the bucket
  const objects = await Promise.all(keys.map((k) => headR2Object(k!)));
  if (objects.some((o) => !o)) return new ApiResponse(400, null, "File not uploaded yet");
  const typeOf = (contentType: string) =>
    contentType.startsWith("image/") ? "image" : contentType.startsWith("video/") ? "video" : null;
  const type = typeOf(objects[0]!.contentType);
  const valid = objects.every((o) => {
    const t = typeOf(o!.contentType);
    return t === type && REEL_MEDIA_TYPES[o!.contentType] && o!.size <= (t === "image" ? MAX_PHOTO_BYTES : MAX_REEL_BYTES);
  });
  // Several files must all be photos
  if (!type || !valid || (keys.length > 1 && type !== "image")) {
    await discard(keys as string[]);
    return new ApiResponse(400, null, "Reels must be one video of at most 200 MB, or up to 10 photos of at most 100 MB each");
  }
  if (await Reel.exists({ key: keys[0] })) return new ApiResponse(409, null, "This file is already posted");

  const reel = await Reel.create({
    author: me,
    type,
    videoUrl: urls[0],
    key: keys[0],
    caption: caption.trim(),
    duration: type === "video" && Number.isFinite(Number(duration)) ? Math.round(Number(duration)) : undefined,
    size: objects.reduce((sum, o) => sum + o!.size, 0),
    photos: keys.length > 1 ? keys.map((key, i) => ({ url: urls[i] as string, key: key!, size: objects[i]!.size })) : undefined,
  });
  const profiles = await getProfiles([me]);
  return new ApiResponse(201, { reel: toReelResponse(reel, profiles, me) }, "Reel posted");
});

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

export const getSuggested = asyncHandler(async (req: Request, res: Response) => {
  const me = String(req.user.phone);
  const [following, blockedMe, mine] = await Promise.all([
    Follow.find({ follower: me }).distinct<string>("following").exec(),
    AllFriendsContact.find({ blockedPhones: Number(me) }).distinct<string>("phone").exec(),
    AllFriendsContact.findOne({ phone: me }).select("blockedPhones").lean<{ blockedPhones?: unknown[] }>(),
  ]);
  const excluded = [me, ...following, ...blockedMe, ...(mine?.blockedPhones ?? []).map(String)];

  const reels = await Reel.find({ author: { $nin: excluded }, ...beforeCursor(req.query.before) })
    .sort({ _id: -1 })
    .limit(PAGE_SIZE)
    .lean<IReel[]>();
  return new ApiResponse(200, await page(reels, me), "Suggested reels fetched");
});

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

export const deleteReel = asyncHandler(async (req: Request, res: Response) => {
  const reel = await Reel.findOne({ _id: req.params.id, author: String(req.user.phone) }).catch(() => null);
  if (!reel) return new ApiResponse(404, null, "Reel not found");

  await reel.deleteOne();
  await Promise.all([
    ReelLike.deleteMany({ reel: reel._id }),
    ReelComment.deleteMany({ reel: reel._id }),
    ...[...new Set([reel.key, ...(reel.photos ?? []).map((p) => p.key)])].map((key) =>
      deleteR2Object(key).catch((e) => console.error("delete reel media failed", e)),
    ),
  ]);
  return new ApiResponse(200, null, "Reel deleted");
});
