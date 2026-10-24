import { model, Schema, Document } from "mongoose";

export interface IDataEncryptKey extends Document {
  userId: string;
  phone: string;
  publicKey: string | object;
  privateKey: string | object;
}

const DataEncryptKeySchema = new Schema({
  userId: { type: String, require: true },
  phone: { type: String, require: true },
  publicKey: { type: Schema.Types.Mixed, require: true },
  privateKey: { type: Schema.Types.Mixed, require: true },
}, { timestamps: true });

export const DataEncryptKey = model<IDataEncryptKey>("DataEncryptKey", DataEncryptKeySchema);