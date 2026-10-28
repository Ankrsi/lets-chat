import { model, Schema, Types } from "mongoose";

export interface IReel {
  _id: Types.ObjectId;
  author: string; // phone, same identity the chat uses
  type: "video" | "image";
  videoUrl: string; // the media URL (kept under this name for existing reels)
  key: string; // object key in the R2 bucket, used to delete the video
  caption: string;
  duration?: number; // seconds, as reported by the uploader
  width?: number; // video size as shown (rotation applied), from the uploader
  height?: number;
  size: number; // bytes, read from R2 when the reel was published (all photos together)
  photos?: { url: string; key: string; size: number }[];
  // Kept on the reel (updated with $inc) so feeds never count likes/comments
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const reelSchema = new Schema<IReel>(
  {
    author: { type: String, required: true },
    type: { type: String, enum: ["video", "image"], default: "video" },
    videoUrl: { type: String, required: true },
    key: { type: String, required: true, unique: true },
    caption: { type: String, trim: true, default: "" },
    duration: { type: Number },
    width: { type: Number },
    height: { type: Number },
    size: { type: Number, required: true },
    photos: {
      type: [{ _id: false, url: { type: String, required: true }, key: { type: String, required: true }, size: { type: Number, required: true } }],
      default: undefined,
    },
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
    shareCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: "reels" },
);

// Feed and profile pages: newest first, per author
reelSchema.index({ author: 1, createdAt: -1 });

export const Reel = model<IReel>("Reel", reelSchema);
