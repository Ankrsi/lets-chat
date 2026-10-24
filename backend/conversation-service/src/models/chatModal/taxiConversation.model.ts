import { Schema, model } from "mongoose";

export interface ITaxiConversation extends Document {
  bookingId?: string;
  members: string[];
  lastMessageId?: string | null;
  lastMessage?: string | null;
  lastMessageStatus?: string | null;
  lastMessageType?: string | null;
  lastMessageSenderId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const conversationSchema = new Schema<ITaxiConversation>(
  {
    bookingId: { type: String, required: false },
    members: [{ type: String, required: true }],
    lastMessageId: { type: String, default: null },
    lastMessage: { type: String, default: null },
    lastMessageStatus: { type: String, default: null },
    lastMessageType: { type: String, default: null },
    lastMessageSenderId: { type: String, default: null }
  },
  { timestamps: true },
);

const TaxiConversation = model<ITaxiConversation>("TaxiConversation", conversationSchema);
export default TaxiConversation;
