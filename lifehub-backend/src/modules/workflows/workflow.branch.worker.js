import prisma from "../../config/db.js";
import { eventBus } from "../../common/events/eventBus.js";

eventBus.on("WORKFLOW.BRANCH.START", async ({ branchId, stateId }) => {

  try {

    // simulate work
    await new Promise(r => setTimeout(r, 1000));

    await prisma.workflow_branches.update({
      where: { id: branchId },
      data: {
        status: "DONE"
      }
    });

    eventBus.emit("WORKFLOW.BRANCH.DONE", { branchId });

  } catch (err) {

    await prisma.workflow_branches.update({
      where: { id: branchId },
      data: { status: "FAILED" }
    });

    eventBus.emit("WORKFLOW.BRANCH.FAILED", { branchId });
  }
});
