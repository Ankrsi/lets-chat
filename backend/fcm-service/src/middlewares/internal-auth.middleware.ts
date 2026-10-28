import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

// Compares hashes in constant time, so the key can't be guessed from response timing
const sameKey = (a: string, b: string) =>
  crypto.timingSafeEqual(crypto.createHash("sha256").update(a).digest(), crypto.createHash("sha256").update(b).digest());

export const verifyInternalRequest = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers["x-internal-api-key"];
  const expected = process.env.INTERNAL_API_KEY;

  if (!expected || typeof apiKey !== "string" || !sameKey(apiKey, expected)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};
