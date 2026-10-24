import mongoose, { Document, Schema } from "mongoose";

export interface IBotChatMessage extends Document {
  convId: string;
  messageId: string;
  senderId: string;
  content: string | object;
  timestamp: Date;
  messageType: "text" | "image";
  createdAt?: Date;
  updatedAt?: Date;
}

const botChatMessageSchema: Schema = new Schema<IBotChatMessage>(
  {
    convId: {
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
      enum: ["text", "image"],
      required: true,
      default: "text",
    }
  },
  {
    timestamps: true,
  },
);

const BotChatMessage = mongoose.model<IBotChatMessage>("BotChatMessage", botChatMessageSchema);

export default BotChatMessage;
