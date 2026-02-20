import prisma from "../../config/db.js";
import { eventBus } from "../../common/events/eventBus.js";

const BRANCH_PROCESS_DELAY_MS = Math.max(
  Number(process.env.WORKFLOW_BRANCH_PROCESS_DELAY_MS || 0),
  0
);

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

eventBus.on("WORKFLOW.BRANCH.START", async ({ branchId }) => {
  try {
    if (BRANCH_PROCESS_DELAY_MS > 0) {
      await wait(BRANCH_PROCESS_DELAY_MS);
    }

    await prisma.workflow_branches.update({
      where: { id: branchId },
      data: {
        status: "DONE"
      }
    });

    eventBus.emit("WORKFLOW.BRANCH.DONE", { branchId });

  } catch {
    await prisma.workflow_branches.update({
      where: { id: branchId },
      data: { status: "FAILED" }
    });

    eventBus.emit("WORKFLOW.BRANCH.FAILED", { branchId });
  }
});
