import multer from "multer";
import path from "path";
import { ApiError } from "../utils/apiError";

const storage = multer.memoryStorage();

const imageFileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
  const allowedExtensions = [".jpeg", ".jpg", ".png", ".webp"];
  const extension = path.extname(file.originalname || "").toLowerCase();
  // Some clients (Postman, Flutter, React Native) send a generic mimetype such as
  // application/octet-stream, so fall back to the file extension before rejecting.
  // if (allowedMimeTypes.includes(file.mimetype)) {
  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(extension)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        `Only image files (jpeg, png, jpg, webp) are allowed! Received "${file.mimetype}" (${file.originalname})`,
        400,
      ),
    );
  }
};

const statusFileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimeTypes = [
    "image/jpeg", "image/png", "image/jpg", "image/webp",
    "video/mp4", "video/mpeg", "video/quicktime", "video/x-msvideo", "video/x-ms-wmv"
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (jpeg, png, jpg, webp) and video files (mp4, mpeg, quicktime, avi, wmv) are allowed!"));
  }
};

export const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for profile image
  fileFilter: imageFileFilter,
});

export const uploadStatus = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for status (image/video)
  fileFilter: statusFileFilter,
});
