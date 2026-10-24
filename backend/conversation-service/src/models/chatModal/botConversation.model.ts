import { Schema, model } from "mongoose";

export interface IBotConversation extends Document {
  member: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const conversationSchema = new Schema<IBotConversation>(
  {
    member: { type: String, required: true },
  },
  { timestamps: true },
);

const BotConversation = model<IBotConversation>("BotConversation", conversationSchema);
export default BotConversation;
