import { Types } from "mongoose";
import AllFriendsContact from "../models/contactModal/allFriendsContact.model";
import { Follow } from "../models/reelModal/follow.model";
import { getUsersByPhones } from "../services/auth/phone.service";

export const PHONE_PATTERN = /^\d{6,15}$/;
export const PAGE_SIZE = 10;

export const hasBlocked = async (owner: string, viewer: string) =>
  !!(await AllFriendsContact.exists({ phone: owner, blockedPhones: Number(viewer) }));

export const isFollowing = async (follower: string, following: string) =>
  !!(await Follow.exists({ follower, following }));

export const canViewReels = async (viewer: string, author: string) =>
  viewer === author || ((await isFollowing(viewer, author)) && !(await hasBlocked(author, viewer)));

export interface PublicProfile {
  phone: string;
  username: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  profile_image: string | null;
}

export const getProfiles = async (phones: string[]): Promise<Map<string, PublicProfile>> => {
  const unique = [...new Set(phones)];
  const users: any[] = unique.length ? await getUsersByPhones(unique) : [];
  const byPhone = new Map(users.map((u) => [String(u.phone), u]));
  return new Map(unique.map((phone) => {
    const u = byPhone.get(phone);
    const first_name = u?.first_name ?? "";
    const last_name = u?.last_name ?? "";
    return [phone, {
      phone,
      username: u?.username ?? null,
      first_name,
      last_name,
      full_name: `${first_name} ${last_name}`.trim(),
      profile_image: u?.profile_image ?? null,
    }];
  }));
};

export const beforeCursor = (before: unknown) =>
  typeof before === "string" && Types.ObjectId.isValid(before) ? { _id: { $lt: new Types.ObjectId(before) } } : {};
