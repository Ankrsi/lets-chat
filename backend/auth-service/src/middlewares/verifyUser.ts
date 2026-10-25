import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AccessClaims, verifyAccessToken } from "../services/token.service";
import { Session } from "../models/session.model";

declare global {
  namespace Express {
    interface Request {
      user?: AccessClaims;
    }
  }
}

export const verifyUser = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { authorization } = req.headers;
  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new ApiError("Missing or invalid Authorization header", 401);
  }

  let claims: AccessClaims;
  try {
    claims = verifyAccessToken(authorization.split(" ")[1]);
  } catch (err: any) {
    throw new ApiError(err?.name === "TokenExpiredError" ? "Access token expired" : "Invalid access token", 401);
  }

  // Access tokens are stateless elsewhere; here we also reject tokens of logged-out sessions
  if (!(await Session.exists({ _id: claims.sid }))) {
    throw new ApiError("Session has ended, please log in again", 401);
  }

  req.user = claims;
  next();
});
