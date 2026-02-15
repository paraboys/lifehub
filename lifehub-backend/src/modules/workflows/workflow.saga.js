import prisma from "../../config/db.js";
import { eventBus } from "../../common/events/eventBus.js";
import { retry } from "../../common/resilience/retry.js";

export async function runCompensation(instanceId) {
  const history = await prisma.workflow_history.findMany({
    where: { instance_id: BigInt(instanceId) },
    orderBy: { changed_at: "desc" }
  });

  for (const step of history) {
    await compensate(step);
  }
}

async function compensate(step) {
  const state = await prisma.workflow_states.findUnique({
    where: { id: step.to_state }
  });
  if (!state) return;

  const handlers = {
    PAID: () => refund(step.instance_id),
    ASSIGNED: () => unassign(step.instance_id),
    COMPLETED: () => reopen(step.instance_id)
  };

  const handler = handlers[state.state_name];
  if (!handler) return;

  await retry(handler, {
    retries: 3,
    backoff: { type: "exponential", baseMs: 500, maxMs: 5000, jitter: 0.2 },
    breakerKey: `workflow.saga.${state.state_name}`,
    context: { instanceId: step.instance_id, stateName: state.state_name }
  });

  eventBus.emit("SAGA.COMPENSATION", {
    instanceId: step.instance_id,
    stateName: state.state_name,
    toState: step.to_state
  });
}

async function refund(instanceId) {
  console.log("Refund triggered for workflow", String(instanceId));
}

async function unassign(instanceId) {
  console.log("Provider unassigned for workflow", String(instanceId));
}

async function reopen(instanceId) {
  console.log("Order reopened for workflow", String(instanceId));
}
