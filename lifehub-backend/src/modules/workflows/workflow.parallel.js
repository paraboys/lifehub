import prisma from "../../config/db.js";
import { eventBus } from "../../common/events/eventBus.js";

export async function spawnParallelBranches(instance, transitions) {
  const branches = [];

  for (const transition of transitions) {
    const branch = await prisma.workflow_branches.create({
      data: {
        parent_instance_id: instance.id,
        state_id: transition.to_state,
        status: "RUNNING"
      }
    });

    branches.push(branch);

    // Execute each branch asynchronously so the parent state transition does not block.
    queueMicrotask(() => {
      eventBus.emit("WORKFLOW.BRANCH.START", {
        branchId: branch.id,
        instanceId: instance.id,
        stateId: transition.to_state
      });
    });
  }

  return branches;
}
