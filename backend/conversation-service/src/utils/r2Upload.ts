import crypto from "crypto";
import r2 from "../config/r2";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface UploadParams {
  file: Express.Multer.File;
  folder?: string; // Optional: to specify a folder in the bucket
}

// R2 objects are not readable through the API endpoint, so public links use the
// bucket's public domain (r2.dev subdomain or a custom domain).
const publicUrl = (key: string) => `${process.env.R2_PUBLIC_URL!.replace(/\/+$/, "")}/${key}`;

export const uploadToR2 = async ({ file, folder = "" }: UploadParams): Promise<string> => {
  if (!file) {
    throw new Error("No file provided for upload.");
  }
  const key = folder
    ? `${folder}/${Date.now()}-${file.originalname}`
    : `${Date.now()}-${file.originalname}`;
  const params = {
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  try {
    await r2.send(new PutObjectCommand(params))
    return publicUrl(key);
  } catch (error) {
    throw new Error(`R2 upload failed: ${(error as Error).message}`);
  }
};

export const presignedUrlR2 = async (fileName: string, conversationId: string, mediaType: string) => {
  // Plain characters only: no "../" or slashes to escape the folder
  const safeName = String(fileName).replace(/[^\w.-]/g, "_").slice(-100);
  const safeConversation = String(conversationId).replace(/[^\w-]/g, "");
  const key = `chats/${safeConversation}/${Date.now()}_${safeName}`;
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    ContentType: mediaType,
  });

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 }); // 5 min
  const fileUrl = publicUrl(key);
  return { uploadUrl, fileUrl };
}

export const REEL_VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "3gp",
};

export const REEL_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

// Reels can be a video or a photo
export const REEL_MEDIA_TYPES: Record<string, string> = { ...REEL_VIDEO_TYPES, ...REEL_IMAGE_TYPES };

// Each user uploads only under their own folder; publishing checks the key is in it
export const reelKeyPrefix = (phone: string) => `reels/${phone}/`;

export const presignedReelUploadR2 = async (phone: string, mediaType: string) => {
  const key = `${reelKeyPrefix(phone)}${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${REEL_MEDIA_TYPES[mediaType]}`;
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    ContentType: mediaType,
  });
  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 15 * 60 }); // videos take longer than images
  return { uploadUrl, fileUrl: publicUrl(key), key };
};

export const keyFromPublicUrl = (url: string): string | null => {
  const base = `${process.env.R2_PUBLIC_URL!.replace(/\/+$/, "")}/`;
  return url.startsWith(base) ? decodeURIComponent(url.slice(base.length)) : null;
};

export const headR2Object = async (key: string) => {
  try {
    const res = await r2.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? "" };
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return null;
    throw err;
  }
};

export const deleteR2Object = (key: string) =>
  r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }));
