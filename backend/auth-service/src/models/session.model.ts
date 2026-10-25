import { model, Schema, Types } from "mongoose";

// One row per logged-in device. Holds the hashed refresh token and the push tokens
// the chat services use to reach that device.
export interface ISession {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  phone: string;
  deviceId: string;
  refreshTokenHash: string;
  fcmToken?: string;
  voipToken?: string;
  deviceType: string;
  appCode: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    phone: { type: String, required: true, index: true },
    deviceId: { type: String, required: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    fcmToken: { type: String },
    voipToken: { type: String },
    deviceType: { type: String, default: "android" },
    appCode: { type: String, default: "SP_MAIN" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "sessions" },
);

// MongoDB removes sessions once the refresh token has expired
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<ISession>("Session", sessionSchema);
