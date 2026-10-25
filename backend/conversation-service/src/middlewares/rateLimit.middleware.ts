import { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import jwt from "jsonwebtoken";

const publicKey = () => process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, "\n");

/**
 * Per user, not per IP: many mobile users share one carrier IP. Requests without a valid
 * token fall back to their IP. Internal service calls are not limited.
 */
const userKey = (req: Request) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token) {
    try {
      const claims: any = jwt.verify(token, publicKey(), { algorithms: ["RS256"], issuer: "auth.superapp" });
      if (claims?.phone) return `user:${claims.phone}`;
    } catch {
      // invalid token: limited by IP below (the route itself rejects it)
    }
  }
  return `ip:${ipKeyGenerator(req.ip ?? "")}`;
};

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT_PER_MIN || 300),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: userKey,
  skip: (req) => !!process.env.INTERNAL_API_KEY && req.headers["x-internal-api-key"] === process.env.INTERNAL_API_KEY,
  message: { statusCode: 429, success: false, message: "Too many requests, slow down." },
});
