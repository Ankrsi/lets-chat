// import mongoose, { model, Schema, Document } from "mongoose";

// export interface IChatStatus extends Document {
//     phone: string;
//     stories: {
//         _id?: mongoose.Types.ObjectId;
//         url: string;
//         type: "image" | "video";
//         caption: string | null;
//         viewers?: { _id: false, phone: string, viewedAt: Date }[]
//         status?: "active" | "expired";
//         expiresAt?: Date;
//         createdAt?: Date;
//     }[];
// }

// const storySchema = new Schema({
//     url: { type: String, required: true },
//     type: { type: String, enum: ["image", "video"], required: true },
//     caption: { type: String, default: null },
//     viewers: { type: [{ _id: false, phone: String, viewedAt: Date }], default: [] },
//     status: { type: String, enum: ["active", "expired"], default: "active" },
//     expiresAt: { type: Date },
//     createdAt: { type: Date, default: Date.now }
// });

// const statusSchema = new Schema<IChatStatus>({
//     phone: { type: String, required: true },
//     stories: { type: [storySchema], required: true }
// }, {
//     timestamps: true
// });

// const ChatStatus = model<IChatStatus>("ChatStatus", statusSchema);

// export default ChatStatus;


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
    phone: { type: String, required: true, index: true },
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

storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ChatStatus = model<IStory>("ChatStatus", storySchema);