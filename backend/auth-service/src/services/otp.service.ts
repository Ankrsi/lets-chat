import crypto from "crypto";
import axios from "axios";
import { Otp, OtpDaily } from "../models/otp.model";
import { ApiError } from "../utils/apiError";
import { toE164 } from "../utils/phone";

const OTP_TTL_MS = 10 * 60 * 1000; // the app tells users the code expires in 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_DAY = 10;

const provider = () => (process.env.OTP_PROVIDER || "console").toLowerCase();

const hashCode = (phone: string, code: string) =>
  crypto.createHash("sha256").update(`${phone}:${code}`).digest("hex");

const safeEqualHex = (a: string, b: string) =>
  crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

const twilio = () => {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID)
    throw new ApiError("Twilio is not configured", 500);
  return axios.create({
    baseURL: `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}`,
    auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN },
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
};

export const sendOtp = async (phone: string) => {
  const now = Date.now();
  const existing = await Otp.findOne({ phone });
  if (existing && now - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt.getTime())) / 1000);
    throw new ApiError(`Please wait ${wait}s before requesting another code`, 429);
  }

  // Daily limit per phone, counted atomically
  const day = new Date(now).toISOString().slice(0, 10);
  const today = await OtpDaily.findOneAndUpdate({ phone, day }, { $inc: { count: 1 } }, { upsert: true, new: true });
  if (today.count > MAX_SENDS_PER_DAY) throw new ApiError("Too many codes requested today. Try again tomorrow.", 429);

  let codeHash: string | undefined;
  if (provider() === "twilio") {
    await twilio()
      .post("/Verifications", new URLSearchParams({ To: toE164(phone), Channel: "sms" }))
      .catch((err) => {
        console.error("Twilio send error:", err?.response?.data || err.message);
        throw new ApiError("Failed to send OTP", 502);
      });
  } else {
    if (process.env.NODE_ENV === "production")
      throw new ApiError("Console OTP provider is disabled in production; set OTP_PROVIDER=twilio", 500);
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    codeHash = hashCode(phone, code);
    console.info(`[DEV OTP] ${phone}: ${code}`);
  }

  await Otp.findOneAndUpdate(
    { phone },
    {
      $set: { attempts: 0, lastSentAt: new Date(now), expiresAt: new Date(now + OTP_TTL_MS), ...(codeHash && { codeHash }) },
      $unset: { verifiedHash: 1, ...(!codeHash && { codeHash: 1 }) },
    },
    { upsert: true },
  );
};

export const checkOtp = async (phone: string, code: string) => {
  const record = await Otp.findOne({ phone });
  if (!record || record.expiresAt.getTime() < Date.now())
    throw new ApiError("OTP expired or not requested", 400);

  // Count this try before checking, in one atomic step: many guesses sent at once
  // can't all slip in under the limit
  const counted = await Otp.findOneAndUpdate(
    { _id: record._id, attempts: { $lt: MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
  );
  if (!counted) throw new ApiError("Too many wrong attempts, request a new code", 429);

  // Already verified once (Twilio won't approve the same code twice): compare locally.
  // A correct repeat (the two-step or "log in anyway" step) gives the try back.
  if (record.verifiedHash) {
    if (!safeEqualHex(record.verifiedHash, hashCode(phone, code))) throw new ApiError("Invalid OTP", 400);
    await Otp.updateOne({ _id: record._id }, { $inc: { attempts: -1 } });
    return;
  }

  let valid = false;
  if (provider() === "twilio") {
    const { data } = await twilio()
      .post("/VerificationCheck", new URLSearchParams({ To: toE164(phone), Code: code }))
      .catch((err) => {
        // Twilio answers 404 when the verification already expired or was used
        if (err?.response?.status === 404) return { data: { status: "expired" } };
        console.error("Twilio check error:", err?.response?.data || err.message);
        throw new ApiError("Failed to verify OTP", 502);
      });
    valid = data?.status === "approved";
  } else if (record.codeHash) {
    valid = safeEqualHex(record.codeHash, hashCode(phone, code));
  }

  if (!valid) throw new ApiError("Invalid OTP", 400);
  await Otp.updateOne({ _id: record._id }, { $set: { verifiedHash: hashCode(phone, code) } });
};

export const consumeOtp = (phone: string) => Otp.deleteOne({ phone });
