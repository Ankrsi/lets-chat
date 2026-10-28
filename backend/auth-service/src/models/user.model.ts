import { model, Schema, Types } from "mongoose";

export interface IUser {
  _id: Types.ObjectId;
  phone: string; // E.164 digits without "+", e.g. "919876543210" (same format the chat services use)
  username?: string; // lowercase, unique; unset until registration is completed
  usernameChangedAt?: Date;
  first_name: string;
  last_name: string;
  about: string;
  email?: string;
  profile_image?: string;
  role: string;
  blockedPhones: string[];
  photoVisibility: "everyone" | "nobody"; // who can see profile_image
  // Two-step verification code (hashed), and its wrong-try counter / lockout
  twoStepEnabled: boolean;
  twoStepPinHash?: string;
  twoStepFailed?: number;
  twoStepLockedUntil?: Date;
  twoStepResetAt?: Date; // "forgot code": two-step turns off at this time, unless the code is used first
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    phone: { type: String, required: true, unique: true },
    username: { type: String, lowercase: true, trim: true },
    usernameChangedAt: { type: Date },
    first_name: { type: String, trim: true, default: "" },
    last_name: { type: String, trim: true, default: "" },
    about: { type: String, trim: true, default: "" },
    email: { type: String, lowercase: true, trim: true },
    profile_image: { type: String },
    role: { type: String, default: "individual" },
    blockedPhones: { type: [String], default: [] },
    photoVisibility: { type: String, enum: ["everyone", "nobody"], default: "everyone" },
    twoStepEnabled: { type: Boolean, default: false },
    twoStepPinHash: { type: String, select: false },
    twoStepFailed: { type: Number, default: 0 },
    twoStepLockedUntil: { type: Date },
    twoStepResetAt: { type: Date },
  },
  { timestamps: true, collection: "users" },
);

// Unique only among users that have picked a username
userSchema.index({ username: 1 }, { unique: true, partialFilterExpression: { username: { $type: "string" } } });

export const User = model<IUser>("User", userSchema);

export const toSelf = (u: IUser) => ({
  _id: String(u._id),
  phone: u.phone,
  username: u.username ?? null,
  first_name: u.first_name,
  last_name: u.last_name,
  full_name: `${u.first_name} ${u.last_name}`.trim(),
  about: u.about,
  email: u.email ?? null,
  profile_image: u.profile_image ?? null,
  isRegistered: !!u.username,
  twoStepEnabled: !!u.twoStepEnabled,
  photoVisibility: u.photoVisibility ?? "everyone",
  createdAt: u.createdAt,
});

// What other people see: no photo if the user hid it
export const publicPhoto = (u: Pick<IUser, "profile_image" | "photoVisibility">) =>
  u.photoVisibility === "nobody" ? null : u.profile_image ?? null;

export const toPublic = (u: IUser) => ({
  _id: String(u._id),
  phone: u.phone,
  username: u.username ?? null,
  first_name: u.first_name,
  last_name: u.last_name,
  full_name: `${u.first_name} ${u.last_name}`.trim(),
  about: u.about,
  profile_image: publicPhoto(u),
});
