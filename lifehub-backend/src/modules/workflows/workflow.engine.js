import prisma from "../../config/db.js";
import { emit } from "./workflow.bus.js";

export async function handleEvent(instanceId, event) {

  const instance = await prisma.workflow_instances.findUnique({
    where: { id: instanceId }
  });

  const transition = await prisma.workflow_transitions.findFirst({
    where: {
      from_state: instance.current_state,
      trigger_event: event
    }
  });

  if (!transition) return;

  await emit("STATE_CHANGE", {
    instanceId,
    nextState: transition.to_state
  });
}


export async function transition(instanceId, event) {

  const instance = await prisma.workflow_instances.findUnique({
    where: { id: instanceId }
  });

  const transition = await prisma.workflow_transitions.findFirst({
    where: {
      from_state: instance.current_state,
      event
    }
  });

  if (!transition) {
    throw new Error("Invalid transition");
  }

  // Update state
  await prisma.workflow_instances.update({
    where: { id: instanceId },
    data: { current_state: transition.to_state }
  });

  // History
  await prisma.workflow_history.create({
    data: {
      instance_id: instanceId,
      from_state: transition.from_state,
      to_state: transition.to_state,
      event
    }
  });

  return transition.to_state;
}
