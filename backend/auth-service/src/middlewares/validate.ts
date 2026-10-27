import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { ApiError } from "../utils/apiError";

type Source = "body" | "query" | "params";

export const validate = (schema: Joi.ObjectSchema, source: Source = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req[source] ?? {}, { abortEarly: false, stripUnknown: true });
    if (error) {
      return next(new ApiError(error.details.map((d) => d.message.replace(/"/g, "")).join(", "), 400));
    }
    if (source === "body") req.body = value;
    else Object.assign(req[source], value);
    next();
  };
