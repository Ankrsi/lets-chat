import { Request, Response, NextFunction } from "express";

export const verifyInternalRequest = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers["x-internal-api-key"] as string | undefined;

  if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};
