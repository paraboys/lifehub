import prisma from "../../config/db.js";
import { getQueue } from "../../config/queue.js";
import { normalizeBigInt } from "../../common/utils/bigint.js";
import { scanFile } from "./malwareScan.adapter.js";

export const MEDIA_QUEUE = "media";
export const MEDIA_DLQ = "media-dlq";

export function getMediaQueue() {
  return getQueue(MEDIA_QUEUE);
}

export function getMediaDlqQueue() {
  return getQueue(MEDIA_DLQ);
}

export async function enqueueMediaScan(fileId) {
  return getMediaQueue().add(
    "media-scan",
    normalizeBigInt({ fileId }),
    {
      attempts: 4,
      backoff: { type: "exponential", delay: 2000 }
    }
  );
}

export async function enqueueThumbnailJob(fileId) {
  return getMediaQueue().add(
    "thumbnail-generate",
    normalizeBigInt({ fileId }),
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 1500 }
    }
  );
}

export async function processMediaScan({ fileId }) {
  const file = await prisma.files.findUnique({
    where: { id: BigInt(fileId) }
  });
  if (!file) throw new Error("File not found");

  const result = await scanFile({
    fileId: file.id,
    storagePath: file.storage_path,
    fileType: file.file_type,
    fileName: file.file_name
  });
  const isUnsafe = result.verdict !== "CLEAN";

  await prisma.analytics_events.create({
    data: {
      event_type: isUnsafe ? "MEDIA.SCAN_FAILED" : "MEDIA.SCAN_PASSED",
      entity_type: "FILE",
      entity_id: file.id,
      metadata: {
        fileType: file.file_type,
        fileName: file.file_name,
        scanEngine: result.engine,
        verdict: result.verdict
      }
    }
  });

  if (isUnsafe) {
    throw new Error("Media scan failed: unsafe file type");
  }

  await enqueueThumbnailJob(file.id);
}

export async function processThumbnail({ fileId }) {
  const file = await prisma.files.findUnique({
    where: { id: BigInt(fileId) }
  });
  if (!file) throw new Error("File not found");

  const cdnBase = process.env.MEDIA_CDN_BASE_URL || "http://localhost:4000/cdn";
  const thumbUrl = `${cdnBase}/${file.storage_path}?variant=thumb`;

  await prisma.analytics_events.create({
    data: {
      event_type: "MEDIA.THUMBNAIL_READY",
      entity_type: "FILE",
      entity_id: file.id,
      metadata: { thumbnailUrl: thumbUrl }
    }
  });
}
