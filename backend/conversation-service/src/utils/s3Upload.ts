import s3 from "../config/s3";
// import { ObjectCannedACL, PutObjectCommand } from '@aws-sdk/client-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface UploadParams {
  file: Express.Multer.File;
  folder?: string; // Optional: to specify a folder in the bucket
}
// export const uploadToS3 = async ({ file, folder = "" }: UploadParams): Promise<string> => {
//   if (!file) {
//     throw new Error("No file provided for upload.");
//   }
//   const key = folder
//     ? `${folder}/${Date.now()}-${file.originalname}`
//     : `${Date.now()}-${file.originalname}`;
//   const params = {
//     Bucket: process.env.AWS_BUCKET_NAME!,
//     Key: key,
//     Body: file.buffer,
//     ACL: "public-read", // Set the file to be publicly readable
//     ContentType: file.mimetype,
//   };
//   try {
//     const data = await s3.upload(params).promise();
//     return data.Location; // S3 file URL
//   } catch (error) {
//     throw new Error(`S3 upload failed: ${(error as Error).message}`);
//   }
// };

export const uploadToS3 = async ({ file, folder = "" }: UploadParams): Promise<string> => {
  if (!file) {
    throw new Error("No file provided for upload.");
  }
  const key = folder
    ? `${folder}/${Date.now()}-${file.originalname}`
    : `${Date.now()}-${file.originalname}`;
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: key,
    Body: file.buffer,
    // ACL: 'public-read' as ObjectCannedACL,
    ContentType: file.mimetype,
  };
  try {
    await s3.send(new PutObjectCommand(params))
    return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  } catch (error) {
    throw new Error(`S3 upload failed: ${(error as Error).message}`);
  }
};

export const presignedUrlS3 = async (fileName: string, conversationId: string, mediaType: string) => {
  const key = `chats/${conversationId}/${Date.now()}_${fileName}`;
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: key,
    ContentType: mediaType,
    // ACL: 'public-read' as ObjectCannedACL,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min
  const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  return { uploadUrl, fileUrl };
}
