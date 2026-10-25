import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";
import jwt from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const verifyUser = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { authorization } = req.headers;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new ApiError("Missing or invalid Authorization header", 401);
  }

  const idToken = authorization.split(" ")[1];

  try {
    const response = jwt.verify(idToken, process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n'), {
      algorithms: ["RS256"],
      issuer: "auth.superapp"
    });

    req.user = response;

    next();
  } catch (err: any) {
    console.error("Failed to fetch user from auth-service:", err?.response?.data || err.message);
    throw new ApiError("Failed to authenticate user", 401);
  }
});
