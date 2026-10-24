import { model, Schema, Document } from "mongoose";

export interface ICall extends Document {
  userId: string;
  phone: string;
  publicKey: string;
}

const PreKeySchema = new Schema({
  userId: { type: String, require: true },
  phone: { type: String, require: true },
  publicKey: {type: String, require: true },
}, { timestamps: true });

export const PreKeyModel = model("PreKey", PreKeySchema);