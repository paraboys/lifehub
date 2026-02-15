import { Worker } from "bullmq";
import { getQueueConnection } from "../../config/queue.js";
import {
  MEDIA_QUEUE,
  getMediaDlqQueue,
  processMediaScan,
  processThumbnail
} from "./media.jobs.js";
import { incDlqEnqueue } from "../../common/observability/metrics.js";
import { logger } from "../../common/observability/logger.js";

let mediaWorker;

export function startMediaWorker() {
  if (mediaWorker) return mediaWorker;

  mediaWorker = new Worker(
    MEDIA_QUEUE,
    async job => {
      switch (job.name) {
        case "media-scan":
          await processMediaScan(job.data);
          return { ok: true };
        case "thumbnail-generate":
          await processThumbnail(job.data);
          return { ok: true };
        default:
          throw new Error(`Unknown media job: ${job.name}`);
      }
    },
    {
      connection: getQueueConnection(),
      concurrency: Number(process.env.MEDIA_WORKER_CONCURRENCY || 4)
    }
  );

  mediaWorker.on("failed", async (job, err) => {
    incDlqEnqueue(job?.name || "media-unknown");
    logger.error("media_job_failed", {
      jobName: job?.name,
      error: err?.message
    });
    await getMediaDlqQueue().add("media-failed", {
      originalJobId: job?.id,
      name: job?.name,
      data: job?.data,
      failedReason: err?.message
    });
  });

  return mediaWorker;
}
