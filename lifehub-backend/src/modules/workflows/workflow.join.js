import prisma from "../../config/db.js";
import { applyTransition } from "./workflow.service.js";

export async function tryJoin(parentInstanceId) {

  const branches = await prisma.workflow_branches.findMany({
    where: { parent_instance_id: parentInstanceId }
  });

  const allDone = branches.every(b => b.status === "DONE");

  if (!allDone) return;

  // find join transition
  const parent = await prisma.workflow_instances.findUnique({
    where: { id: parentInstanceId }
  });

  const joinTransition = await prisma.workflow_transitions.findFirst({
    where: { from_state: parent.current_state }
  });

  if (!joinTransition) return;

  await applyTransition(parentInstanceId, joinTransition.to_state, null);
}
