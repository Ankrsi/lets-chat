import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { ApiError } from "../utils/apiError";
import { ALLOWED_IMAGE_TYPES } from "../utils/r2Upload";

const single = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new ApiError("Profile image must be JPEG, PNG or WebP", 400));
  },
}).single("profile_image");

export const uploadProfileImage = (req: Request, res: Response, next: NextFunction) =>
  single(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(new ApiError(err.code === "LIMIT_FILE_SIZE" ? "Profile image must be 5 MB or smaller" : err.message, 400));
    }
    next(err);
  });
