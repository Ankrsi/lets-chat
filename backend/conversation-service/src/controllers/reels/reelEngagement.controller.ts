import { Request, Response } from "express";
import { Types } from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { IReel, Reel } from "../../models/reelModal/reel.model";
import { ReelLike } from "../../models/reelModal/reelLike.model";
import { IReelComment, ReelComment } from "../../models/reelModal/reelComment.model";
import { beforeCursor, canViewReels, getProfiles } from "../../utils/social";

const MAX_COMMENT = 500;
const COMMENT_PAGE = 20;

const viewableReel = async (id: string, me: string) => {
  if (!Types.ObjectId.isValid(id)) return null;
  const reel = await Reel.findById(id).select("author likeCount commentCount shareCount").lean<IReel>();
  if (!reel || !(await canViewReels(me, reel.author))) return null;
  return reel;
};

const counts = async (id: Types.ObjectId | string) =>
  Reel.findById(id).select("likeCount commentCount shareCount").lean<Pick<IReel, "likeCount" | "commentCount" | "shareCount">>();

export const likeReel = asyncHandler(async (req: Request, res: Response) => {
  const me = String(req.user.phone);
  const reel = await viewableReel(req.params.id, me);
  if (!reel) return new ApiResponse(404, null, "Reel not found");

  const result = await ReelLike.updateOne(
    { user: me, reel: reel._id },
    { $setOnInsert: { user: me, reel: reel._id } },
    { upsert: true },
  );
  if (result.upsertedCount === 1) await Reel.updateOne({ _id: reel._id }, { $inc: { likeCount: 1 } });

  const c = await counts(reel._id);
  return new ApiResponse(200, { liked: true, likeCount: c?.likeCount ?? 0 }, "Liked");
});

export const unlikeReel = asyncHandler(async (req: Request, res: Response) => {
  const me = String(req.user.phone);
  if (!Types.ObjectId.isValid(req.params.id)) return new ApiResponse(404, null, "Reel not found");
  const reelId = new Types.ObjectId(req.params.id);

  const { deletedCount } = await ReelLike.deleteOne({ user: me, reel: reelId });
  // Guarded so a race can never push the count below zero
  if (deletedCount === 1) await Reel.updateOne({ _id: reelId, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });

  const c = await counts(reelId);
  return new ApiResponse(200, { liked: false, likeCount: c?.likeCount ?? 0 }, "Unliked");
});

export const shareReel = asyncHandler(async (req: Request, res: Response) => {
  const me = String(req.user.phone);
  const reel = await viewableReel(req.params.id, me);
  if (!reel) return new ApiResponse(404, null, "Reel not found");
  await Reel.updateOne({ _id: reel._id }, { $inc: { shareCount: 1 } });
  return new ApiResponse(200, { shareCount: (reel.shareCount ?? 0) + 1 }, "Shared");
});

const toComment = (c: IReelComment, profiles: Map<string, any>, me: string, reelAuthor: string) => ({
  _id: String(c._id),
  text: c.text,
  createdAt: c.createdAt,
  author: profiles.get(c.author),
  isMine: c.author === me,
  // Comment authors and the reel's author can delete
  canDelete: c.author === me || reelAuthor === me,
});

export const getComments = asyncHandler(async (req: Request, res: Response) => {
  const me = String(req.user.phone);
  const reel = await viewableReel(req.params.id, me);
  if (!reel) return new ApiResponse(404, null, "Reel not found");

  const comments = await ReelComment.find({ reel: reel._id, ...beforeCursor(req.query.before) })
    .sort({ _id: -1 })
    .limit(COMMENT_PAGE)
    .lean<IReelComment[]>();
  const profiles = await getProfiles(comments.map((c) => c.author));
  return new ApiResponse(200, {
    comments: comments.map((c) => toComment(c, profiles, me, reel.author)),
    nextCursor: comments.length === COMMENT_PAGE ? String(comments[comments.length - 1]._id) : null,
    commentCount: reel.commentCount ?? 0,
  }, "Comments fetched");
});

export const addComment = asyncHandler(async (req: Request, res: Response) => {
  const me = String(req.user.phone);
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return new ApiResponse(400, null, "Comment can't be empty");
  if (text.length > MAX_COMMENT) return new ApiResponse(400, null, `Comments can be at most ${MAX_COMMENT} characters`);

  const reel = await viewableReel(req.params.id, me);
  if (!reel) return new ApiResponse(404, null, "Reel not found");

  const comment = await ReelComment.create({ reel: reel._id, author: me, text });
  const updated = await Reel.findByIdAndUpdate(reel._id, { $inc: { commentCount: 1 } }, { new: true })
    .select("commentCount")
    .lean<IReel>();
  const profiles = await getProfiles([me]);
  return new ApiResponse(201, {
    comment: toComment(comment.toObject(), profiles, me, reel.author),
    commentCount: updated?.commentCount ?? 0,
  }, "Comment added");
});

export const deleteComment = asyncHandler(async (req: Request, res: Response) => {
  const me = String(req.user.phone);
  const { id, commentId } = req.params;
  if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(commentId)) return new ApiResponse(404, null, "Comment not found");

  const reel = await Reel.findById(id).select("author").lean<IReel>();
  if (!reel) return new ApiResponse(404, null, "Reel not found");
  const filter = reel.author === me ? { _id: commentId, reel: reel._id } : { _id: commentId, reel: reel._id, author: me };

  const { deletedCount } = await ReelComment.deleteOne(filter);
  if (!deletedCount) return new ApiResponse(404, null, "Comment not found");
  const updated = await Reel.findOneAndUpdate(
    { _id: reel._id, commentCount: { $gt: 0 } },
    { $inc: { commentCount: -1 } },
    { new: true },
  ).select("commentCount").lean<IReel>();
  return new ApiResponse(200, { commentCount: updated?.commentCount ?? 0 }, "Comment deleted");
});
