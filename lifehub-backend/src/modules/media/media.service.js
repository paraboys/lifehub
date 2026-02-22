import prisma from "../../config/db.js";
import { enqueueMediaScan } from "./media.jobs.js";
import { generateUploadUrl } from "./storage.adapter.js";

function buildStoragePath(ownerId, fileName) {
  const safeName = String(fileName || "file").replace(/[^\w.\-]/g, "_");
  return `uploads/${String(ownerId)}/${Date.now()}_${safeName}`;
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

function toCdnUrl(storagePath, { publicBaseUrl } = {}) {
  const base = normalizeBaseUrl(
    process.env.MEDIA_CDN_BASE_URL
      || process.env.MEDIA_PUBLIC_BASE_URL
      || (publicBaseUrl ? `${normalizeBaseUrl(publicBaseUrl)}/cdn` : "")
      || "http://localhost:4000/cdn"
  );
  return `${base}/${storagePath}`;
}

export async function initUpload({
  ownerId,
  fileName,
  fileType,
  fileSize,
  isPrivate = true,
  publicBaseUrl
}) {
  const storagePath = buildStoragePath(ownerId, fileName);
  const file = await prisma.files.create({
    data: {
      owner_id: BigInt(ownerId),
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize ? BigInt(fileSize) : null,
      storage_path: storagePath,
      is_private: isPrivate
    }
  });

  const storage = await generateUploadUrl({
    key: storagePath,
    contentType: fileType,
    publicBaseUrl
  });

  return {
    fileId: file.id,
    uploadUrl: storage.uploadUrl,
    cdnUrl: storage.cdnUrl || toCdnUrl(storagePath, { publicBaseUrl }),
    storagePath,
    provider: storage.provider
  };
}

export async function completeUpload({ fileId, publicBaseUrl }) {
  const file = await prisma.files.findUnique({
    where: { id: BigInt(fileId) }
  });
  if (!file) throw new Error("File not found");

  await enqueueMediaScan(file.id);

  return {
    fileId: file.id,
    status: "PROCESSING",
    cdnUrl: toCdnUrl(file.storage_path, { publicBaseUrl })
  };
}

export async function getFile(fileId, { publicBaseUrl } = {}) {
  const file = await prisma.files.findUnique({
    where: { id: BigInt(fileId) }
  });
  if (!file) throw new Error("File not found");
  return {
    ...file,
    cdnUrl: toCdnUrl(file.storage_path, { publicBaseUrl })
  };
}
