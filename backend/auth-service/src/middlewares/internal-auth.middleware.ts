import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

// Service-to-service calls carry the shared INTERNAL_API_KEY
export const verifyInternalRequest = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = String(req.headers["x-internal-api-key"] ?? "");
  const expected = process.env.INTERNAL_API_KEY ?? "";
  const ok =
    expected.length > 0 &&
    apiKey.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(expected));
  if (!ok) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  next();
};
