import { redisClient } from "../redis/redisClient";

// Who is connected where. One Redis set of socket ids per user and one owner key per socket,
// instead of a single shared hash: no hot key, no read-modify-write races, and every command
// touches one user's keys only (works on Redis Cluster).
const DAY = 24 * 60 * 60; // stale entries left by a crashed instance expire on their own

const socketsKey = (phone: string) => `sockets:${phone}`;
const ownerKey = (socketId: string) => `socketOwner:${socketId}`;
const onlineKey = (phone: string) => `user:${phone}:online`;

export const addSocket = async (phone: string, socketId: string, replaceOthers = false) => {
  if (replaceOthers) await redisClient.del(socketsKey(phone));
  await Promise.all([
    redisClient.sAdd(socketsKey(phone), socketId),
    redisClient.expire(socketsKey(phone), DAY),
    redisClient.set(ownerKey(socketId), phone, { EX: DAY }),
    redisClient.set(onlineKey(phone), "1"),
  ]);
};

export const removeSocket = async (socketId: string): Promise<{ phone: string; offline: boolean } | null> => {
  const phone = await redisClient.get(ownerKey(socketId));
  if (!phone) return null;
  await Promise.all([redisClient.sRem(socketsKey(phone), socketId), redisClient.del(ownerKey(socketId))]);
  const remaining = await redisClient.sCard(socketsKey(phone));
  if (remaining > 0) return { phone, offline: false };
  await Promise.all([
    redisClient.set(onlineKey(phone), "0"),
    redisClient.del([`user:${phone}:inCall`]),
  ]);
  return { phone, offline: true };
};

export const ownerOf = (socketId: string) => redisClient.get(ownerKey(socketId));

export const socketsOf = (phones: string[]): Promise<string[][]> =>
  Promise.all(phones.map((p) => redisClient.sMembers(socketsKey(String(p)))));
