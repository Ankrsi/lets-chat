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

// Checks the file's first bytes, not the type the client claims
const isImage = (b: Buffer) =>
  (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || // JPEG
  b.subarray(0, 4).toString("hex") === "89504e47" || // PNG
  (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP"); // WebP

export const uploadProfileImage = (req: Request, res: Response, next: NextFunction) =>
  single(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(new ApiError(err.code === "LIMIT_FILE_SIZE" ? "Profile image must be 5 MB or smaller" : err.message, 400));
    }
    if (!err && req.file && !isImage(req.file.buffer)) {
      return next(new ApiError("Profile image must be JPEG, PNG or WebP", 400));
    }
    next(err);
  });
