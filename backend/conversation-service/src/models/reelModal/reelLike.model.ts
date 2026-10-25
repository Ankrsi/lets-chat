import { model, Schema, Types } from "mongoose";

// One row per (reel, user): liking twice is a no-op. Counts live on the reel (likeCount).
export interface IReelLike {
  reel: Types.ObjectId;
  user: string; // phone
  createdAt: Date;
}

const reelLikeSchema = new Schema<IReelLike>(
  {
    reel: { type: Schema.Types.ObjectId, required: true },
    user: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "reel_likes" },
);

// Uniqueness + "which of these reels did I like" lookups
reelLikeSchema.index({ user: 1, reel: 1 }, { unique: true });
// Cascade delete when a reel is removed
reelLikeSchema.index({ reel: 1 });

export const ReelLike = model<IReelLike>("ReelLike", reelLikeSchema);
