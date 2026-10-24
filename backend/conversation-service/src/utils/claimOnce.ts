import crypto from "crypto";
import { redisClient } from "../redis/redisClient";

/**
 * Redis pub/sub delivers every published message to EVERY subscribed instance.
 * With N replicas of this service, a fan-out handler (io.to(...).emit / kafka
 * producer.send) therefore runs N times for a single publish. The socket.io
 * redis-adapter already routes `io.to(socketIds)` to whichever instance owns
 * that socket, so exactly ONE instance needs to run the handler.
 *
 * claimOnce is that gate: the first instance to SET the key wins and processes
 * the event, the rest bail out.
 *
 * @param channel  redis channel name (namespaces the key)
 * @param payload  raw published string, hashed when no natural id is given
 * @param id       natural unique id of the event (messageId, callId+status, ...)
 * @param ttlSeconds how long the claim is remembered
 * @returns true if this instance should process the event
 */
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
