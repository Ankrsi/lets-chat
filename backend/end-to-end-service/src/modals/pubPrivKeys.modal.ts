import { model, Schema, Document } from "mongoose";

export interface IKeys extends Document {
  userId: string;
  phone: string;
  keys: string;
  createdAt: Date;
  updatedAt: Date;
}

const PubPrivKeySchema = new Schema({
  userId: { type: String, require: true },
  phone: { type: String, require: true },
  keys: { type: String, require: true }
}, { timestamps: true });

export const PubPrivKeyModel = model<IKeys>("PubPrivKey", PubPrivKeySchema);