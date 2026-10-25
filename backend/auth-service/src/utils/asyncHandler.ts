import { NextFunction, Request, Response } from "express";
import { ApiError } from "./apiError";
import { ApiResponse } from "./apiResponse";

type ControllerFunction = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export const asyncHandler = (fn: ControllerFunction) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fn(req, res, next);

      if (result === undefined || res.headersSent) return;

      if (result instanceof ApiResponse) {
        res.status(result.statusCode).json(result);
        return;
      }

      throw new ApiError(
        `Controller must return an ApiResponse, got: ${typeof result}`,
        500
      );
    } catch (err) {
      next(normalizeError(err));
    }
  };
};

const normalizeError = (err: unknown): ApiError => {
  if (err instanceof ApiError) return err;
  if (err instanceof Error) return new ApiError(err.message, 500);
  return new ApiError(String(err ?? "Unknown error"), 500);
};
