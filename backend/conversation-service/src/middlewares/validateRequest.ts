import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { ApiError } from "../utils/apiError";
import { t } from "../../i18n";


export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    console.info('req.body joi validation|', req.body)
    const { error } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      const messages = error.details.map((detail) =>
        t(detail.message, req.language || "en")
      );
      console.error("Validation error:", messages);

      return next(new ApiError(messages.join(", "), 400));
    }

    next();
  };
};
