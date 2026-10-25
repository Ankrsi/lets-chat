import { Schema, model } from "mongoose";

export interface GroupDescription {
  desc?: string;
  createdBy?: string;
  createdAt?: Date;
}

export interface IConversation extends Document {
  type: "single" | "group";
  members: string[];
  removedMembers: string[];
  name?: string | null;
  avatar?: string | null;
  admins?: string[];
  groupDescription?: GroupDescription | null;
  lastMessageId?: string | null;
  lastMessage?: string | null;
  lastMessageStatus?: string | null;
  lastMessageType?: string | null;
  lastMessageSenderId?: string | null;
  lastMessageDate?: Date | null;
  active?: boolean;
  hiddenFor?: string[];
  disappearingMessages?: boolean;
  disappearingMessagesTime?: string;
  pinnedBy?: string[];
  blocked?: boolean;
  blockedBy?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    type: { type: String, enum: ["single", "group"], required: true },
    members: [{ type: String, required: true }],
    removedMembers: [{ type: String, required: true }],
    name: { type: String, default: null }, // for group
    avatar: { type: String, default: null }, // optional group avatar
    admins: { type: [String], default: [] },
    groupDescription: {
      type: {
        desc: String,
        createdBy: String,
        createdAt: Date
      }, default: null
    },
    lastMessageId: { type: String, default: null },
    lastMessage: { type: String, default: null },
    lastMessageStatus: { type: String, default: null },
    lastMessageType: { type: String, default: null },
    lastMessageSenderId: { type: String, default: null },
    lastMessageDate: { type: Date, default: new Date() },
    active: { type: Boolean, default: true },
    hiddenFor: [{ type: String, default: [] }],
    disappearingMessages: { type: Boolean, default: false },
    disappearingMessagesTime: { type: String, default: "off" },
    pinnedBy: [{ type: String, default: [] }],
    blocked: { type: Boolean, default: false},
    blockedBy: { type: [String], default: []},
  },
  { timestamps: true },
);

conversationSchema.index({ members: 1 });

const Conversation = model<IConversation>("Conversation", conversationSchema);
export default Conversation;
