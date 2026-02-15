import prisma from "../../config/db.js";

export async function forkWorkflow(instance) {

  const outgoing = await prisma.workflow_transitions.findMany({
    where: { from_state: instance.current_state }
  });

  if (outgoing.length <= 1) return false; // not parallel

  for (const t of outgoing) {

    const branch = await prisma.workflow_instances.create({
      data: {
        workflow_id: instance.workflow_id,
        entity_type: instance.entity_type,
        entity_id: instance.entity_id,
        current_state: t.to_state
      }
    });

    await prisma.workflow_branches.create({
      data: {
        parent_instance_id: instance.id,
        branch_instance_id: branch.id,
        state_id: t.to_state
      }
    });
  }

  return true;
}
