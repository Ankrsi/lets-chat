import { model, Schema } from "mongoose";

// One pending OTP challenge per phone. codeHash is only set by the console provider;
// Twilio Verify keeps the code on its side, and this row then just enforces the resend cooldown.
// verifiedHash is set once the code has been verified, until the login completes.
export interface IOtp {
  phone: string;
  codeHash?: string;
  verifiedHash?: string;
  attempts: number;
  lastSentAt: Date;
  expiresAt: Date;
}

const otpSchema = new Schema<IOtp>(
  {
    phone: { type: String, required: true, unique: true },
    codeHash: { type: String },
    verifiedHash: { type: String },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: "otps" },
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp = model<IOtp>("Otp", otpSchema);
