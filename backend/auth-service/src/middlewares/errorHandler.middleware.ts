import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";

export async function ErrorHandler(
  error: ApiError | Error,
  request: Request,
  response: Response,
  next: NextFunction
) {
  if (response.headersSent) {
    return next(error);
  }

  if (error instanceof ApiError) {
    return response
      .status(error.statusCode)
      .json(new ApiResponse(error.statusCode, error.error, error.message));
  }

  return response.status(500).json(new ApiResponse(500, null, error.message));
}
