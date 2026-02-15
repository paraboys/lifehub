import prisma from "../../config/db.js";
import { eventBus } from "../../common/events/eventBus.js";

export async function spawnParallelBranches(instance, transitions) {

  const branches = [];

  for (const t of transitions) {

    const branch = await prisma.workflow_branches.create({
      data: {
        parent_instance_id: instance.id,
        state_id: t.to_state,
        status: "RUNNING"
      }
    });

    branches.push(branch);

    // 🔥 fire async execution
    queueMicrotask(() => {
      eventBus.emit("WORKFLOW.BRANCH.START", {
        branchId: branch.id,
        instanceId: instance.id,
        stateId: t.to_state
      });
    });
  }

  return branches;
}
