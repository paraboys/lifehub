import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getS3Client() {
  const endpoint = process.env.S3_ENDPOINT || undefined;
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || "false") === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ""
    }
  });
}

function resolveProvider() {
  return (process.env.MEDIA_STORAGE_PROVIDER || "local").toLowerCase();
}

export async function generateUploadUrl({ key, contentType }) {
  const provider = resolveProvider();

  if (provider === "s3" || provider === "r2") {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("S3_BUCKET missing");

    const client = getS3Client();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || "application/octet-stream"
    });
    const signedUrl = await getSignedUrl(client, command, {
      expiresIn: Number(process.env.S3_SIGNED_URL_EXPIRY_SECONDS || 900)
    });

    const cdnBase = process.env.MEDIA_CDN_BASE_URL || "";
    const cdnUrl = cdnBase
      ? `${cdnBase.replace(/\/$/, "")}/${key}`
      : signedUrl.split("?")[0];

    return {
      provider,
      uploadUrl: signedUrl,
      cdnUrl
    };
  }

  const uploadBase = process.env.MEDIA_UPLOAD_BASE_URL || "http://localhost:4000/upload";
  const cdnBase = process.env.MEDIA_CDN_BASE_URL || "http://localhost:4000/cdn";
  return {
    provider: "local",
    uploadUrl: `${uploadBase}/${key}`,
    cdnUrl: `${cdnBase}/${key}`
  };
}
