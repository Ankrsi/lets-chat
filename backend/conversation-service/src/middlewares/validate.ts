import { Request, Response, NextFunction } from "express";

export const validate = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.details.map((err: any) => err.message),
      });
    }

    req.body = value;
    next();
  };
};