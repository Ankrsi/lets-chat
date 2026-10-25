import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { IUser, User } from "../models/user.model";
import { Session } from "../models/session.model";
import { ApiError } from "../utils/apiError";

// The chat, e2e and socket servers verify access tokens with JWT_PUBLIC_KEY, RS256 and this issuer.
export const ISSUER = "auth.superapp";

const pem = (value?: string) => (value ?? "").replace(/\\n/g, "\n");
const refreshTtlMs = () => Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30) * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const newRefreshToken = () => crypto.randomBytes(48).toString("base64url");

export interface AccessClaims {
  _id: string;
  phone: string;
  username: string | null;
  role: string;
  sid: string;
}

const signAccessToken = (user: IUser, sessionId: Types.ObjectId | string) => {
  const claims: AccessClaims = {
    _id: String(user._id),
    phone: user.phone,
    username: user.username ?? null,
    role: user.role,
    sid: String(sessionId),
  };
  return jwt.sign(claims, pem(process.env.JWT_PRIVATE_KEY), {
    algorithm: "RS256",
    issuer: ISSUER,
    subject: String(user._id),
    expiresIn: (process.env.ACCESS_TOKEN_TTL || "1h") as jwt.SignOptions["expiresIn"],
  });
};

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, pem(process.env.JWT_PUBLIC_KEY), { algorithms: ["RS256"], issuer: ISSUER }) as AccessClaims;

interface DeviceInfo {
  deviceId: string;
  fcmToken?: string;
  voipToken?: string;
  deviceType?: string;
  appCode?: string;
}

/** Starts (or restarts) the session for this device and returns a fresh token pair. */
export const createSession = async (user: IUser, device: DeviceInfo) => {
  const refreshToken = newRefreshToken();
  const session = await Session.findOneAndUpdate(
    { userId: user._id, deviceId: device.deviceId },
    {
      $set: {
        phone: user.phone,
        refreshTokenHash: hashToken(refreshToken),
        fcmToken: device.fcmToken,
        voipToken: device.voipToken,
        deviceType: device.deviceType || "android",
        appCode: device.appCode || "SP_MAIN",
        expiresAt: new Date(Date.now() + refreshTtlMs()),
      },
    },
    { upsert: true, new: true },
  );
  return { accessToken: signAccessToken(user, session._id), refreshToken, session };
};

/** Exchanges a refresh token for a new pair. The old refresh token stops working. */
export const rotateRefreshToken = async (refreshToken: string) => {
  const session = await Session.findOne({ refreshTokenHash: hashToken(refreshToken) });
  if (!session || session.expiresAt.getTime() < Date.now())
    throw new ApiError("Invalid or expired refresh token", 401);

  const user = await User.findById(session.userId);
  if (!user) {
    await session.deleteOne();
    throw new ApiError("User no longer exists", 401);
  }

  const next = newRefreshToken();
  session.refreshTokenHash = hashToken(next);
  session.expiresAt = new Date(Date.now() + refreshTtlMs());
  await session.save();
  return { accessToken: signAccessToken(user, session._id), refreshToken: next };
};

/** Re-issues an access token for an existing session, e.g. after the username changed. */
export const reissueAccessToken = (user: IUser, sessionId: string) => signAccessToken(user, sessionId);
