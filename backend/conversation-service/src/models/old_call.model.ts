import mongoose, { Document, Schema } from "mongoose";

export interface ICall extends Document {
  callId: string;
  callerId: string;
  receiverId: string;
  status: "initiated" | "ringing" | "accepted" | "rejected" | "ended" | "missed";
  startedAt?: Date; // when ringing started or when connected — we’ll keep it on offer
  connectedAt?: Date; // when WebRTC connects
  endedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const callSchema = new Schema<ICall>(
  {
    callId: { type: String, required: true, unique: true, index: true },
    callerId: { type: String, required: true, index: true },
    receiverId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["initiated", "ringing", "accepted", "rejected", "ended", "missed"],
      default: "initiated",
      index: true,
    },
    startedAt: { type: Date },
    connectedAt: { type: Date },
    endedAt: { type: Date },
  },
  { timestamps: true },
);

// Useful compound index to fetch recent active between two users fast
callSchema.index({ callerId: 1, receiverId: 1, createdAt: -1, status: 1 }, { name: "call_lookup" });

const Call = mongoose.model<ICall>("Call", callSchema);
export default Call;
