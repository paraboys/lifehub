import { retry } from "../../common/resilience/retry.js";
import { dispatchWorkflowNotification } from "./workflow.notifications.js";
import { eventBus } from "../../common/events/eventBus.js";

function escalationMessage(action) {
  switch (action) {
    case "NOTIFY_L1":
      return "SLA breach escalation level 1";
    case "NOTIFY_L2":
      return "SLA breach escalation level 2";
    case "ESCALATE_MANAGER":
      return "SLA breach escalated to manager";
    default:
      return `SLA escalation action: ${action}`;
  }
}

export async function runEscalationAction(payload) {
  const { action = "UNKNOWN" } = payload || {};

  return retry(async () => {
    await dispatchWorkflowNotification({
      eventType: "WORKFLOW.SLA_ESCALATION",
      payload: {
        ...payload,
        message: escalationMessage(action)
      },
      severity: action === "ESCALATE_MANAGER" ? "CRITICAL" : "HIGH"
    });

    eventBus.emit("WORKFLOW.SLA_ESCALATION_HANDLED", payload);
    return true;
  }, {
    retries: 4,
    backoff: {
      type: "exponential",
      baseMs: 1000,
      maxMs: 15000,
      jitter: 0.2
    },
    breakerKey: `workflow.escalation.${action}`,
    context: payload
  });
}
