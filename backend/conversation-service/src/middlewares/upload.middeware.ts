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
    // cb(new Error("Only image files (jpeg, png, jpg, webp) are allowed!"));
    cb(
      new ApiError(
        `Only image files (jpeg, png, jpg, webp) are allowed! Received "${file.mimetype}" (${file.originalname})`,
        400,
      ),
    );
  }
};

const documentFileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimeTypes = [
    "application/pdf",
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/vnd.ms-excel", // .xls
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "text/csv", // .csv
    "application/vnd.ms-powerpoint", // .ppt
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
    "text/plain", // .txt
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, DOC, DOCX, PPTX, PPT, XLS, XLSX and TXT files are allowed!"));
  }
};

const voiceFileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimeTypes = [
    "audio/mpeg",        // mp3
    "audio/mp3",         // mp3 (fallback)
    "audio/wav",         // wav
    "audio/x-wav",       // wav
    "audio/webm",        // webm (WebRTC)
    "audio/ogg",         // ogg
    "audio/opus",        // opus
    "audio/mp4",         // m4a (iOS)
    "audio/aac",         // aac
    "audio/3gpp",        // 3gp (Android)
    "audio/m4a",         // m4a (Android)
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only audio files are allowed like mp3, m4a, wav, webm, ogg, opus, m4a, aac, 3gp"));
  }
};

const videoFileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimeTypes = [
    "video/mp4",        // mp4 (most common)
    "video/mpeg",       // mpeg
    "video/quicktime",  // mov (iOS)
    "video/x-msvideo",  // avi
    "video/x-matroska", // mkv
    "video/webm",       // webm (WebRTC / browser)
    "video/3gpp",       // 3gp (Android)
    "video/3gpp2",      // 3g2
    "video/ogg",        // ogg/ogv
    "video/x-flv",      // flv
  ];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only video files are allowed like mp4, mov, avi, mkv, webm, 3gp, ogg"));
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

export const uploadDocument = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for documents
  fileFilter: documentFileFilter,
});

export const uploadVoice = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for voice
  fileFilter: voiceFileFilter,
});

export const uploadVideo = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for video
  fileFilter: videoFileFilter,
});

export const uploadStatus = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for status (image/video)
  fileFilter: statusFileFilter,
});
// }).fields([
//   { name: "image", maxCount: 5 },
//   { name: "video", maxCount: 5 },
// ]);
