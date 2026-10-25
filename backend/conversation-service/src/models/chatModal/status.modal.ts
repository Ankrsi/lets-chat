import { Schema, model, Document } from "mongoose";

export interface IStory extends Document {
    phone: string;
    url: string;
    type: "image" | "video";
    caption: string | null;
    viewers: { phone: string; viewedAt: Date }[];
    createdAt: Date;
    expiresAt: Date;
}

const storySchema = new Schema<IStory>({
    phone: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String, enum: ["image", "video"], required: true },
    caption: { type: String, default: null },
    viewers: {
        type: [{ _id: false, phone: String, viewedAt: Date }],
        default: []
    },
    createdAt: { type: Date, default: Date.now },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
});

// Mongo deletes stories when they expire
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Status feed: live stories of these phones
storySchema.index({ phone: 1, expiresAt: 1 });

export const ChatStatus = model<IStory>("ChatStatus", storySchema);