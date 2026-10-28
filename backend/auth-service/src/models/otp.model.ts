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

// SMS codes sent per phone per day (stops SMS bombing and SMS-cost abuse). Removed after a day.
export interface IOtpDaily {
  phone: string;
  day: string; // YYYY-MM-DD (UTC)
  count: number;
  createdAt: Date;
}

const otpDailySchema = new Schema<IOtpDaily>(
  {
    phone: { type: String, required: true },
    day: { type: String, required: true },
    count: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
  },
  { collection: "otp_daily" },
);

otpDailySchema.index({ phone: 1, day: 1 }, { unique: true });

export const OtpDaily = model<IOtpDaily>("OtpDaily", otpDailySchema);
