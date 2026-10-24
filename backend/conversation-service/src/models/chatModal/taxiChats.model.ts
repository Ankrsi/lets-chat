import mongoose, { Document, Schema } from "mongoose";

export interface ITaxiChatMessage extends Document {
  bookingId: string;
  messageId: string;
  senderId: string;
  content: string | object;
  timestamp: Date;
  messageType: "text" | "image" | "video";
  status: "sent" | "delivered" | "read";
  createdAt?: Date;
  updatedAt?: Date;
}

const taxiChatMessageSchema: Schema = new Schema<ITaxiChatMessage>(
  {
    bookingId: {
      type: String,
      required: true,
    },
    messageId: {
      type: String,
      required: true,
      unique: true,
    },
    senderId: {
      type: String,
      required: true,
    },
    content: {
      type: Schema.Types.Mixed,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    messageType: {
      type: String,
      enum: ["text", "image", "video"],
      required: true,
      default: "text",
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      required: true,
      default: "sent",
    },
  },
  {
    timestamps: true,
  },
);

const TaxiChatMessage = mongoose.model<ITaxiChatMessage>("TaxiChatMessage", taxiChatMessageSchema);

export default TaxiChatMessage;
