import prisma from "../../config/db.js";
import { applyTransition } from "./workflow.service.js";
import { eventBus } from "../../common/events/eventBus.js";
import { getSlaPolicy, getSystemPolicies } from "./workflow.policies.js";
import { normalizeBigInt } from "../../common/utils/bigint.js";

export async function checkSLA() {
  const instances = await prisma.workflow_instances.findMany({
    where: { current_state: { not: null } },
    include: { workflow_states: true }
  });

  const now = Date.now();

  for (const wf of instances) {
    const stateName = wf.workflow_states?.state_name;
    const slaPolicy = getSlaPolicy(stateName);
    if (!slaPolicy) continue;

    const ageSeconds = getAgeInSeconds(wf.started_at, now);
    if (ageSeconds < slaPolicy.breachSeconds) continue;

    const failureTransition = await prisma.workflow_transitions.findFirst({
      where: {
        from_state: wf.current_state,
        trigger_event: "SLA_BREACH"
      }
    });
    if (!failureTransition) continue;

    const breachPayload = normalizeBigInt({
      instanceId: wf.id,
      workflowId: wf.workflow_id,
      stateName,
      ageSeconds,
      breachSeconds: slaPolicy.breachSeconds
    });

    eventBus.emit("WORKFLOW.SLA_BREACHED", breachPayload);

    await applyTransition(
      wf.id,
      failureTransition.to_state,
      null,
      { event: "SLA_BREACH", ...breachPayload }
    );

    await processEscalations(wf, ageSeconds, slaPolicy.escalations || []);
  }
}

async function processEscalations(instance, ageSeconds, escalations) {
  const { staleEscalationEventWindowSeconds } = getSystemPolicies();

  for (const step of escalations) {
    if (ageSeconds < step.afterSeconds) continue;

    const alreadyTriggered = await wasEscalationRecentlyTriggered({
      instanceId: instance.id,
      stateId: instance.current_state,
      action: step.action,
      windowSeconds: staleEscalationEventWindowSeconds
    });
    if (alreadyTriggered) continue;

    const payload = normalizeBigInt({
      instanceId: instance.id,
      workflowId: instance.workflow_id,
      stateId: instance.current_state,
      stateName: instance.workflow_states?.state_name,
      action: step.action,
      ageSeconds
    });

    await prisma.analytics_events.create({
      data: {
        event_type: "WORKFLOW.SLA_ESCALATION",
        entity_type: "WORKFLOW_INSTANCE",
        entity_id: instance.id,
        metadata: payload
      }
    });

    eventBus.emit("WORKFLOW.SLA_ESCALATION", payload);
  }
}

async function wasEscalationRecentlyTriggered({
  instanceId,
  stateId,
  action,
  windowSeconds
}) {
  const threshold = new Date(Date.now() - windowSeconds * 1000);
  const recent = await prisma.analytics_events.findMany({
    where: {
      event_type: "WORKFLOW.SLA_ESCALATION",
      entity_type: "WORKFLOW_INSTANCE",
      entity_id: instanceId,
      created_at: {
        gte: threshold
      }
    },
    select: { metadata: true }
  });

  return recent.some(event => {
    const metadata = event.metadata || {};
    return String(metadata.stateId || stateId) === String(stateId)
      && metadata.action === action;
  });
}

function getAgeInSeconds(dateValue, nowMs) {
  if (!dateValue) return 0;
  return (nowMs - new Date(dateValue).getTime()) / 1000;
}
