import mongoose, { Document, Schema } from "mongoose";

export interface IChatMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  messageId: string;
  senderId: string;
  receiverMsgStatus: {
    memberId: string;
    status: "sent" | "delivered" | "read";
    timestamp: Date;
  }[];
  // receiverId: string;
  content: string | object;
  searchText?: string | null;
  timestamp: Date;
  messageType: "text" | "image" | "video" | "location" | "audio" | "voice" | "file" | "money" | "money_request" | "document" | "contact" | "disappear" | "group_create";
  // chatId: string;
  status: "sent" | "delivered" | "read";
  active?: boolean;
  hiddenFor?: string[];
  edited?: boolean;
  isEditable?: boolean;
  replyToMessage?: string | object | null;
  forwarded?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const chatMessageSchema: Schema = new Schema<IChatMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
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
    receiverMsgStatus: {
      type: [
        {
          memberId: {
            type: String,
            required: true,
          },
          status: {
            type: String,
            enum: ["sent", "delivered", "read"],
            required: true,
            default: "sent",
          },
          timestamp: {
            type: Date,
            required: true,
            default: () => new Date(),
          },
        }
      ],
      default: []
    },
    // receiverId: {
    //   type: String,
    //   required: true,
    // },
    content: {
      type: Schema.Types.Mixed,
      required: true,
    },
    searchText: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    messageType: {
      type: String,
      enum: ["text", "image", "video", "location", "audio", "voice", "file", "document", "money", "money_request", "contact", "disappear", "group_create"],
      required: true,
      default: "text",
    },
    // chatId: {
    //   type: String,
    //   required: true,
    // },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      required: true,
      default: "sent",
    },
    active: { type: Boolean, default: true },
    hiddenFor: [{ type: String, default: [] }],
    edited: { type: Boolean, default: false },
    isEditable: { type: Boolean, default: false },
    replyToMessage: { type: Schema.Types.Mixed, default: null },
    forwarded: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
);

chatMessageSchema.pre("save", function (next) {
  if (this.messageType === "text" && typeof this.content === "string") {
    this.searchText = this.content;
  } else if (this.messageType === "text" && this.content?.msg) {
    this.searchText = this.content.msg;
  } else {
    this.searchText = null;
  }
  next();
});

chatMessageSchema.index({ conversationId: 1, timestamp: -1 });
chatMessageSchema.index({ searchText: "text" });

const ChatMessage = mongoose.model<IChatMessage>("ChatMessage", chatMessageSchema);

export default ChatMessage;
