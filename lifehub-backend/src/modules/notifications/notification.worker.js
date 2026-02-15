import { deliverPendingBatch } from "./notification.service.js";
import { logger } from "../../common/observability/logger.js";

let timer = null;

export function startNotificationWorker() {
  const intervalMs = Math.max(
    Number(process.env.NOTIFICATION_SCAN_INTERVAL_MS || 5000),
    1000
  );

  if (timer) return;

  timer = setInterval(async () => {
    try {
      await deliverPendingBatch(Number(process.env.NOTIFICATION_BATCH_SIZE || 100));
    } catch (error) {
      logger.error("notification_worker_failed", {
        error: error.message
      });
    }
  }, intervalMs);
}

export function stopNotificationWorker() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
