import { eventBus } from "../../common/events/eventBus.js";
import { initKafka, publish } from "../../common/events/kafka.js";
import {
  initRedisPipeline,
  publishRedisEvent,
  startRedisEventSubscriber
} from "../../common/events/redisPipeline.js";
import {
  enqueueEscalationActionJob,
  enqueueNotificationJob,
  schedulePolicyAutoTransition
} from "./workflow.jobs.js";
import { normalizeBigInt } from "../../common/utils/bigint.js";
import { publishOutboxEvent } from "../../common/events/eventStream.js";
import { incWorkflowEvent } from "../../common/observability/metrics.js";

const TOPIC_PREFIX = process.env.KAFKA_WORKFLOW_TOPIC_PREFIX || "workflow";

const EVENT_TOPICS = {
  "WORKFLOW.STATE_CHANGED": "events",
  "WORKFLOW.SLA_BREACHED": "events",
  "WORKFLOW.SLA_ESCALATION": "events",
  "WORKFLOW.SLA_ESCALATION_HANDLED": "events",
  "WORKFLOW.STUCK_DETECTED": "events",
  "ORDER.PAYMENT_HELD": "events",
  "ORDER.PAYMENT_RELEASED": "events",
  "ORDER.PAYMENT_REFUNDED": "events",
  "SERVICE_REQUEST.CREATED": "events",
  "SERVICE_REQUEST.ASSIGNED": "events",
  "SERVICE_REQUEST.CANCELLED": "events",
  "SERVICE_REQUEST.COMPLETED": "events",
  "RETRY.ATTEMPT": "retry",
  "RETRY.FAILURE": "retry",
  "SAGA.COMPENSATION": "saga"
};

function topic(name) {
  return `${TOPIC_PREFIX}.${name}`;
}

function keyFromEventType(eventType) {
  return eventType.toLowerCase().replace(/\./g, "-");
}

async function fanOutEvent(eventType, payload) {
  const topicName = EVENT_TOPICS[eventType];
  if (!topicName) return;
  if (payload?.__pipeline?.ingested) return;
  const safePayload = normalizeBigInt(payload);

  await Promise.allSettled([
    publish(topic(topicName), keyFromEventType(eventType), {
      type: eventType,
      payload: safePayload
    }),
    publishRedisEvent(eventType, safePayload),
    publishOutboxEvent(eventType, safePayload)
  ]);

  incWorkflowEvent(eventType);
}

export async function initWorkflowEvents() {
  await initKafka();
  await initRedisPipeline();
  await startRedisEventSubscriber((eventType, payload) => {
    if (!EVENT_TOPICS[eventType]) return;
    eventBus.emit(eventType, payload);
  });

  const allEvents = Object.keys(EVENT_TOPICS);

  for (const eventType of allEvents) {
    eventBus.on(eventType, async payload => {
      await fanOutEvent(eventType, payload);
    });
  }

  eventBus.on("WORKFLOW.SLA_BREACHED", async payload => {
    await enqueueNotificationJob({
      eventType: "WORKFLOW.SLA_BREACHED",
      payload,
      severity: "HIGH"
    });
  });

  eventBus.on("WORKFLOW.SLA_ESCALATION", async payload => {
    await enqueueEscalationActionJob(payload);
  });

  eventBus.on("WORKFLOW.STUCK_DETECTED", async payload => {
    await enqueueNotificationJob({
      eventType: "WORKFLOW.STUCK_DETECTED",
      payload,
      severity: "HIGH"
    });
  });

  eventBus.on("WORKFLOW.STATE_CHANGED", async payload => {
    await schedulePolicyAutoTransition({
      instanceId: payload.instanceId,
      stateId: payload.toState,
      stateName: payload.toStateName
    });
  });
}
