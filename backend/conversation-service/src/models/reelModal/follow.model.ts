import { model, Schema } from "mongoose";

// `follower` sees `following`'s reels. Both are phones.
export interface IFollow {
  follower: string;
  following: string;
  createdAt: Date;
}

const followSchema = new Schema<IFollow>(
  {
    follower: { type: String, required: true },
    following: { type: String, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "follows" },
);

followSchema.index({ follower: 1, following: 1 }, { unique: true });

export const Follow = model<IFollow>("Follow", followSchema);
