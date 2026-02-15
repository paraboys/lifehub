import prisma from "../../config/db.js";
import { eventBus } from "../../common/events/eventBus.js";
import { runCompensation } from "./workflow.saga.js";
import { retry } from "./workflow.retry.js";
import { enqueueDelayedTransition } from "./workflow.jobs.js";

export const startWorkflow = async (workflowId, entityType, entityId) => {
  if (!workflowId) throw new Error("workflowId missing");

  const startState = await prisma.workflow_states.findFirst({
    where: {
      workflow_id: BigInt(workflowId),
      workflow_transitions_workflow_transitions_to_stateToworkflow_states: {
        none: {}
      }
    }
  });
  if (!startState) throw new Error("No start state found for workflow graph");

  return prisma.workflow_instances.create({
    data: {
      entity_type: entityType,
      entity_id: BigInt(entityId),
      workflows: { connect: { id: BigInt(workflowId) } },
      workflow_states: { connect: { id: startState.id } }
    }
  });
};

export async function applyEvent(instanceId, event, userId) {
  const instance = await prisma.workflow_instances.findUnique({
    where: { id: BigInt(instanceId) }
  });
  if (!instance) throw new Error("Workflow instance not found");

  const transition = await prisma.workflow_transitions.findFirst({
    where: {
      from_state: instance.current_state,
      trigger_event: event
    }
  });
  if (!transition) throw new Error(`No transition for event: ${event}`);

  return applyTransition(instance.id, transition.to_state, userId, {
    event
  });
}

export async function moveWorkflow(instanceId, nextStateId, userId, options = {}) {
  const { delayMs, meta } = options;

  if (delayMs && delayMs > 0) {
    return enqueueDelayedTransition({
      instanceId,
      nextStateId,
      userId,
      delayMs,
      meta
    });
  }

  return applyTransition(instanceId, nextStateId, userId, meta);
}

export async function applyTransition(instanceId, nextStateId, userId, meta = {}) {
  return retry(async () => {
    return prisma.$transaction(async tx => {
      const instance = await tx.workflow_instances.findUnique({
        where: { id: BigInt(instanceId) }
      });
      if (!instance) throw new Error("Workflow instance not found");

      if (instance.current_state === BigInt(nextStateId)) {
        return instance;
      }

      const nextState = await tx.workflow_states.findUnique({
        where: { id: BigInt(nextStateId) }
      });
      if (!nextState) throw new Error("State not found");

      if (nextState.type === "PARALLEL") {
        const outgoing = await tx.workflow_transitions.findMany({
          where: { from_state: nextState.id }
        });
        if (!outgoing.length) {
          throw new Error("Parallel state has no outgoing transitions");
        }

        await tx.workflow_instances.update({
          where: { id: instance.id },
          data: {
            workflow_states: { connect: { id: nextState.id } }
          }
        });

        for (const transition of outgoing) {
          const branch = await tx.workflow_instances.create({
            data: {
              entity_type: instance.entity_type,
              entity_id: instance.entity_id,
              workflows: { connect: { id: instance.workflow_id } },
              workflow_states: { connect: { id: transition.to_state } }
            }
          });

          await tx.workflow_branches.create({
            data: {
              parent_instance_id: instance.id,
              branch_instance_id: branch.id,
              state_id: transition.to_state,
              status: "RUNNING"
            }
          });
        }

        queueMicrotask(() => {
          eventBus.emit("WORKFLOW.PARALLEL_STARTED", {
            instanceId: instance.id,
            workflowId: instance.workflow_id
          });
        });

        return instance;
      }

      const transition = await tx.workflow_transitions.findFirst({
        where: {
          from_state: instance.current_state,
          to_state: BigInt(nextStateId)
        }
      });
      if (!transition) {
        throw new Error(`Illegal transition ${instance.current_state} -> ${nextStateId}`);
      }

      const updated = await tx.workflow_instances.update({
        where: { id: instance.id },
        data: { workflow_states: { connect: { id: BigInt(nextStateId) } } }
      });

      await tx.workflow_history.create({
        data: {
          instance_id: instance.id,
          transition_id: transition.id,
          from_state: instance.current_state,
          to_state: BigInt(nextStateId),
          action_by: userId ? BigInt(userId) : null
        }
      });

      queueMicrotask(() => {
        eventBus.emit("WORKFLOW.STATE_CHANGED", {
          instanceId: instance.id,
          workflowId: instance.workflow_id,
          entityType: instance.entity_type,
          entityId: instance.entity_id,
          fromState: instance.current_state,
          toState: BigInt(nextStateId),
          toStateName: nextState.state_name,
          meta
        });
      });

      return updated;
    });
  }, {
    retries: 5,
    backoff: {
      type: "exponential",
      baseMs: 200,
      maxMs: 5000,
      jitter: 0.2
    },
    breakerKey: "workflow.applyTransition",
    breakerOptions: {
      failureThreshold: 5,
      openDurationMs: 10000,
      halfOpenMaxSuccesses: 2
    },
    context: { instanceId, nextStateId, meta }
  }).catch(async error => {
    await runCompensation(instanceId);
    throw error;
  });
}
