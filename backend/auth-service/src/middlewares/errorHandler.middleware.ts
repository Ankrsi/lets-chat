import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";

// Internal details (database, storage errors) stay in the logs, not in responses
const serverMessage = (error: Error) => {
  console.error(error);
  return process.env.NODE_ENV === "production" ? "Something went wrong. Please try again." : error.message;
};

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
    const message = error.statusCode >= 500 ? serverMessage(error) : error.message;
    return response.status(error.statusCode).json(new ApiResponse(error.statusCode, error.error, message));
  }

  return response.status(500).json(new ApiResponse(500, null, serverMessage(error)));
}
