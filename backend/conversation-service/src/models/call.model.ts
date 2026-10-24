import mongoose, { Document, Schema } from "mongoose";

export interface ICall extends Document {
  callId: string;
  avatar?: string;
  callerId: string;
  receiverId: [string];
  status: "initiated" | "ringing" | "accepted" | "rejected" | "ended" | "missed";
  type: "audio" | "video";
  startedAt?: Date;
  connectedAt?: Date;
  endedAt?: Date;
  timestamp?: Date;
}

const callSchema = new Schema<ICall>(
  {
    callId: { type: String, required: true, unique: true, index: true },
    avatar: { type: String, default: null },
    callerId: { type: String, required: true, index: true },
    receiverId: { type: [String], required: true, index: true },
    status: {
      type: String,
      enum: ["initiated", "ringing", "accepted", "rejected", "ended", "missed"],
      default: "initiated",
      index: true,
    },
    type: { type: String, enum: ["audio", "video"], default: "audio" },
    startedAt: { type: Date },
    connectedAt: { type: Date },
    endedAt: { type: Date },
    timestamp: {type: Date, default: new Date()}
  },
  { timestamps: true },
);

// Useful compound index to fetch recent active between two users fast
callSchema.index({ callerId: 1, receiverId: 1, createdAt: -1, status: 1 }, { name: "call_lookup" });

const Call = mongoose.model<ICall>("Call", callSchema);
export default Call;
