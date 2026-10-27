import crypto from "crypto";
import { redisClient } from "../redis/redisClient";

export const claimOnce = async (
  channel: string,
  payload: string,
  id?: string | null,
  ttlSeconds = 60
): Promise<boolean> => {
  const fingerprint =
    id != null && `${id}`.length
      ? `${id}`
      : crypto.createHash("sha1").update(payload).digest("hex");

  try {
    const res = await redisClient.set(`once:${channel}:${fingerprint}`, "1", {
      condition: "NX",
      expiration: { type: "EX", value: ttlSeconds },
    });
    return res === "OK";
  } catch (e) {
    // Fail open: a duplicate emit is less harmful than a dropped message.
    console.error(`claimOnce error on ${channel}`, e);
    return true;
  }
};
