import { S3Client } from "@aws-sdk/client-s3";

// Cloudflare R2 is S3-compatible: same SDK, account-scoped endpoint, region "auto".
const r2 = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  region: "auto",
  // R2 rejects the CRC32 checksum headers newer SDK versions send by default
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
export default r2;
