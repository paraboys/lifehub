import prisma from "../../config/db.js";
import * as service from "./workflow.service.js";
import { checkSLA } from "./workflow.sla.js";
import { getQueue } from "../../config/queue.js";
import { getStatePolicy, getSystemPolicies } from "./workflow.policies.js";
import { eventBus } from "../../common/events/eventBus.js";
import { normalizeBigInt } from "../../common/utils/bigint.js";
import {
  runWorkflowNotificationDeliveryBatch
} from "./workflow.notifications.js";

export const WORKFLOW_QUEUE = "workflow";
export const WORKFLOW_DLQ = "workflow-dlq";
const AUTOMATION_SCAN_INTERVAL_MS = Math.max(
  Number(process.env.WORKFLOW_AUTOMATION_SCAN_INTERVAL_MS || 60000),
  15000
);
const SLA_CHECK_INTERVAL_MS = Math.max(
  Number(process.env.WORKFLOW_SLA_CHECK_INTERVAL_MS || 180000),
  30000
);
const STUCK_DETECTION_INTERVAL_MS = Math.max(
  Number(process.env.WORKFLOW_STUCK_DETECTION_INTERVAL_MS || 120000),
  30000
);
const NOTIFICATION_DELIVERY_SCAN_INTERVAL_MS = Math.max(
  Number(process.env.WORKFLOW_NOTIFICATION_DELIVERY_SCAN_INTERVAL_MS || 120000),
  30000
);

export function getWorkflowQueue() {
  return getQueue(WORKFLOW_QUEUE);
}

export function getWorkflowDlq() {
  return getQueue(WORKFLOW_DLQ);
}

export async function ensureWorkflowSchedulers() {
  const queue = getWorkflowQueue();

  await queue.add(
    "automation-scan",
    {},
    {
      repeat: { every: AUTOMATION_SCAN_INTERVAL_MS },
      jobId: "workflow:automation-scan",
      attempts: 3,
      backoff: { type: "exponential", delay: 500 }
    }
  );

  await queue.add(
    "sla-check",
    {},
    {
      repeat: { every: SLA_CHECK_INTERVAL_MS },
      jobId: "workflow:sla-check",
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 }
    }
  );

  await queue.add(
    "stuck-detection",
    {},
    {
      repeat: { every: STUCK_DETECTION_INTERVAL_MS },
      jobId: "workflow:stuck-detection",
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 }
    }
  );

  await queue.add(
    "notification-delivery-scan",
    {},
    {
      repeat: { every: NOTIFICATION_DELIVERY_SCAN_INTERVAL_MS },
      jobId: "workflow:notification-delivery-scan",
      attempts: 3,
      backoff: { type: "exponential", delay: 1500 }
    }
  );
}

export async function runAutomationScan() {
  const instances = await prisma.workflow_instances.findMany({
    where: { current_state: { not: null } },
    include: { workflow_states: true }
  });

  for (const wf of instances) {
    const autoTransitions = await prisma.workflow_transitions.findMany({
      where: {
        from_state: wf.current_state,
        trigger_event: null,
        OR: [
          { requires_action: false },
          { requires_action: null }
        ]
      },
      select: { to_state: true }
    });

    if (autoTransitions.length !== 1) continue;

    await service.moveWorkflow(wf.id, autoTransitions[0].to_state, null);
  }
}

export async function runSlaCheck() {
  await checkSLA();
}

export async function runStuckDetection() {
  const { stuckWorkflowThresholdSeconds, staleEscalationEventWindowSeconds } = getSystemPolicies();
  const nowMs = Date.now();

  const instances = await prisma.workflow_instances.findMany({
    where: { current_state: { not: null } },
    select: { id: true, current_state: true, started_at: true }
  });

  for (const instance of instances) {
    const latestHistory = await prisma.workflow_history.findFirst({
      where: { instance_id: instance.id },
      orderBy: { changed_at: "desc" },
      select: { changed_at: true }
    });

    const lastActivityAt = latestHistory?.changed_at || instance.started_at;
    if (!lastActivityAt) continue;

    const inactivitySeconds =
      (nowMs - new Date(lastActivityAt).getTime()) / 1000;

    if (inactivitySeconds < stuckWorkflowThresholdSeconds) continue;

    const recentlyRaised = await prisma.analytics_events.findFirst({
      where: {
        event_type: "WORKFLOW.STUCK_DETECTED",
        entity_type: "WORKFLOW_INSTANCE",
        entity_id: instance.id,
        created_at: {
          gte: new Date(Date.now() - staleEscalationEventWindowSeconds * 1000)
        }
      },
      select: { id: true }
    });
    if (recentlyRaised) continue;

    const payload = normalizeBigInt({
      instanceId: instance.id,
      currentState: instance.current_state,
      inactivitySeconds
    });

    await prisma.analytics_events.create({
      data: {
        event_type: "WORKFLOW.STUCK_DETECTED",
        entity_type: "WORKFLOW_INSTANCE",
        entity_id: instance.id,
        metadata: payload
      }
    });

    eventBus.emit("WORKFLOW.STUCK_DETECTED", payload);
  }
}

export async function runNotificationDeliveryScan() {
  await runWorkflowNotificationDeliveryBatch(100);
}

export async function enqueueDelayedTransition({
  instanceId,
  nextStateId,
  userId,
  delayMs,
  meta = {},
  dedupeKey
}) {
  const queue = getWorkflowQueue();
  const safePayload = normalizeBigInt({ instanceId, nextStateId, userId, meta });

  return queue.add(
    "delayed-transition",
    safePayload,
    {
      delay: Math.max(0, delayMs || 0),
      jobId: dedupeKey || `workflow:transition:${instanceId}:${nextStateId}:${Date.now()}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 }
    }
  );
}

export async function enqueueNotificationJob({
  eventType,
  payload,
  severity = "MEDIUM"
}) {
  const queue = getWorkflowQueue();
  const safePayload = normalizeBigInt({ eventType, payload, severity });
  return queue.add(
    "notification-dispatch",
    safePayload,
    {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 }
    }
  );
}

export async function enqueueEscalationActionJob(payload) {
  const queue = getWorkflowQueue();
  const safePayload = normalizeBigInt(payload);
  const safeInstanceId = String(safePayload.instanceId || "unknown");
  const safeStateName = String(safePayload.stateName || "unknown");
  const safeAction = String(safePayload.action || "unknown");
  return queue.add(
    "sla-escalation-action",
    safePayload,
    {
      attempts: 6,
      backoff: { type: "exponential", delay: 5000 },
      jobId: `workflow:escalation:${safeInstanceId}:${safeStateName}:${safeAction}`
    }
  );
}

export async function schedulePolicyAutoTransition({
  instanceId,
  stateId,
  stateName
}) {
  const policy = getStatePolicy(stateName);
  if (!policy?.autoTransition) return null;

  const transition = await prisma.workflow_transitions.findFirst({
    where: {
      from_state: BigInt(stateId),
      trigger_event: policy.autoTransition.event
    },
    select: { to_state: true }
  });
  if (!transition) return null;

  return enqueueDelayedTransition({
    instanceId,
    nextStateId: transition.to_state,
    userId: null,
    delayMs: policy.autoTransition.delaySeconds * 1000,
    meta: {
      event: policy.autoTransition.event,
      source: "policy.autoTransition"
    },
    dedupeKey: `workflow:auto:${instanceId}:${String(stateId)}:${policy.autoTransition.event}`
  });
}

export async function getWorkflowQueueStats() {
  const queue = getWorkflowQueue();
  const dlq = getWorkflowDlq();
  const [main, dead] = await Promise.all([
    queue.getJobCounts("waiting", "active", "delayed", "failed", "completed"),
    dlq.getJobCounts("waiting", "active", "delayed", "failed", "completed")
  ]);

  return { workflow: main, dlq: dead };
}

export async function listDlqJobs(limit = 20) {
  const dlq = getWorkflowDlq();
  const jobs = await dlq.getJobs(["waiting", "delayed", "failed"], 0, Math.max(0, limit - 1), true);
  return jobs.map(job => ({
    id: job.id,
    name: job.name,
    data: job.data,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp
  }));
}

export async function requeueDlqJob(jobId) {
  const dlq = getWorkflowDlq();
  const queue = getWorkflowQueue();
  const job = await dlq.getJob(jobId);
  if (!job) throw new Error("DLQ job not found");

  await queue.add(job.name, job.data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 }
  });
  await job.remove();
}
