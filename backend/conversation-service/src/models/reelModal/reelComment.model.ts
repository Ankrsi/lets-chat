import { model, Schema, Types } from "mongoose";

export interface IReelComment {
  _id: Types.ObjectId;
  reel: Types.ObjectId;
  author: string; // phone
  text: string;
  createdAt: Date;
}

const reelCommentSchema = new Schema<IReelComment>(
  {
    reel: { type: Schema.Types.ObjectId, required: true },
    author: { type: String, required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "reel_comments" },
);

// Comment pages: newest first per reel (cursor on _id); also used for cascade deletes
reelCommentSchema.index({ reel: 1, _id: -1 });

export const ReelComment = model<IReelComment>("ReelComment", reelCommentSchema);
