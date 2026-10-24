import { model, Schema, Document } from "mongoose";

export interface IGroupKeysBackup extends Document {
  userId: string;
  phone: string;
  conversationId: string;
  encryptedGroupKey: string;
}

const GroupKeysBackupSchema = new Schema({
  userId: { type: String, require: true },
  phone: { type: String, require: true },
  conversationId: { type: String, require: true },
  encryptedGroupKey: { type: String, require: true },
}, { timestamps: true });

GroupKeysBackupSchema.index(
  { conversationId: 1, phone: 1 },
  { unique: true }
);

export const GroupKeysBackupModel = model("GroupKeysBackup", GroupKeysBackupSchema);
