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

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

export async function generateUploadUrl({ key, contentType, publicBaseUrl }) {
  const provider = resolveProvider();
  const resolvedPublicBase = normalizeBaseUrl(
    process.env.MEDIA_PUBLIC_BASE_URL || publicBaseUrl || ""
  );

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

    const cdnBase = normalizeBaseUrl(
      process.env.MEDIA_CDN_BASE_URL || resolvedPublicBase || ""
    );
    const cdnUrl = cdnBase
      ? `${cdnBase.replace(/\/$/, "")}/${key}`
      : signedUrl.split("?")[0];

    return {
      provider,
      uploadUrl: signedUrl,
      cdnUrl
    };
  }

  const uploadBase = normalizeBaseUrl(
    process.env.MEDIA_UPLOAD_BASE_URL || (resolvedPublicBase ? `${resolvedPublicBase}/upload` : "")
  ) || "http://localhost:4000/upload";
  const cdnBase = normalizeBaseUrl(
    process.env.MEDIA_CDN_BASE_URL || (resolvedPublicBase ? `${resolvedPublicBase}/cdn` : "")
  ) || "http://localhost:4000/cdn";
  return {
    provider: "local",
    uploadUrl: `${uploadBase}/${key}`,
    cdnUrl: `${cdnBase}/${key}`
  };
}
