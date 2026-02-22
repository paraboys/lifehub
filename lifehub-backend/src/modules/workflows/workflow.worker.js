import { Worker } from "bullmq";

import { getQueueConnection } from "../../config/queue.js";
import {
  WORKFLOW_QUEUE,
  getWorkflowDlq,
  runNotificationDeliveryScan,
  runStuckDetection,
  runAutomationScan,
  runSlaCheck
} from "./workflow.jobs.js";
import { applyTransition } from "./workflow.service.js";
import { dispatchWorkflowNotification } from "./workflow.notifications.js";
import { runEscalationAction } from "./workflow.escalation.js";
import { incDlqEnqueue } from "../../common/observability/metrics.js";
import { logger } from "../../common/observability/logger.js";

let worker;

export function startWorkflowWorker() {
  if (worker) return worker;

  const connection = getQueueConnection();

  worker = new Worker(
    WORKFLOW_QUEUE,
    async job => {
      switch (job.name) {
        case "automation-scan":
          await runAutomationScan();
          return { ok: true };
        case "sla-check":
          await runSlaCheck();
          return { ok: true };
        case "stuck-detection":
          await runStuckDetection();
          return { ok: true };
        case "notification-delivery-scan":
          await runNotificationDeliveryScan();
          return { ok: true };
        case "delayed-transition": {
          const { instanceId, nextStateId, userId, meta } = job.data;
          await applyTransition(instanceId, nextStateId, userId, meta);
          return { ok: true };
        }
        case "notification-dispatch":
          await dispatchWorkflowNotification(job.data);
          return { ok: true };
        case "sla-escalation-action":
          await runEscalationAction(job.data);
          return { ok: true };
        default:
          throw new Error(`Unknown workflow job: ${job.name}`);
      }
    },
    {
      connection,
      concurrency: Number(process.env.WORKFLOW_WORKER_CONCURRENCY || 8)
    }
  );

  worker.on("failed", async (job, err) => {
    const dlq = getWorkflowDlq();
    incDlqEnqueue(job?.name || "unknown");
    logger.error("workflow_job_failed", {
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      error: err?.message
    });
    await dlq.add(
      "workflow-failed",
      {
        originalJobId: job?.id,
        name: job?.name,
        data: job?.data,
        attemptsMade: job?.attemptsMade,
        queueName: WORKFLOW_QUEUE,
        failedReason: err?.message,
        stacktrace: err?.stack
      },
      {
        removeOnComplete: 1000,
        removeOnFail: 1000
      }
    );
  });

  worker.on("error", err => {
    logger.error("workflow_worker_error", {
      error: err?.message || "Unknown worker error"
    });
  });

  return worker;
}
