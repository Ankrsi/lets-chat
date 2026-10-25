import { PutObjectCommand } from "@aws-sdk/client-s3";
import r2 from "../config/r2";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Uploads a profile photo and returns its public URL. */
export const uploadProfileImage = async (userId: string, file: Express.Multer.File): Promise<string> => {
  const key = `profile/${userId}/${Date.now()}.${EXTENSIONS[file.mimetype] ?? "jpg"}`;
  try {
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));
  } catch (error) {
    throw new Error(`R2 upload failed: ${(error as Error).message}`);
  }
  return `${process.env.R2_PUBLIC_URL!.replace(/\/+$/, "")}/${key}`;
};

export const ALLOWED_IMAGE_TYPES = Object.keys(EXTENSIONS);
