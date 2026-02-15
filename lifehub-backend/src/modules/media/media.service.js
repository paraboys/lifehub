import prisma from "../../config/db.js";
import { enqueueMediaScan } from "./media.jobs.js";
import { generateUploadUrl } from "./storage.adapter.js";

function buildStoragePath(ownerId, fileName) {
  const safeName = String(fileName || "file").replace(/[^\w.\-]/g, "_");
  return `uploads/${String(ownerId)}/${Date.now()}_${safeName}`;
}

function toCdnUrl(storagePath) {
  const base = process.env.MEDIA_CDN_BASE_URL || "http://localhost:4000/cdn";
  return `${base}/${storagePath}`;
}

export async function initUpload({
  ownerId,
  fileName,
  fileType,
  fileSize,
  isPrivate = true
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
    contentType: fileType
  });

  return {
    fileId: file.id,
    uploadUrl: storage.uploadUrl,
    cdnUrl: storage.cdnUrl || toCdnUrl(storagePath),
    storagePath,
    provider: storage.provider
  };
}

export async function completeUpload({ fileId }) {
  const file = await prisma.files.findUnique({
    where: { id: BigInt(fileId) }
  });
  if (!file) throw new Error("File not found");

  await enqueueMediaScan(file.id);

  return {
    fileId: file.id,
    status: "PROCESSING",
    cdnUrl: toCdnUrl(file.storage_path)
  };
}

export async function getFile(fileId) {
  const file = await prisma.files.findUnique({
    where: { id: BigInt(fileId) }
  });
  if (!file) throw new Error("File not found");
  return {
    ...file,
    cdnUrl: toCdnUrl(file.storage_path)
  };
}
