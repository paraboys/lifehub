import prisma from "../../config/db.js";
import { eventBus } from "../../common/events/eventBus.js";
import { applyEvent } from "../workflows/workflow.service.js";
import { logger } from "../../common/observability/logger.js";

eventBus.on("CHAT.WORKFLOW_COMMAND", async payload => {
  try {
    if (payload.command !== "JOB_DONE") return;

    const senderId = BigInt(payload.senderId);

    const latestOrder = await prisma.orders.findFirst({
      where: { user_id: senderId },
      orderBy: { created_at: "desc" }
    });
    if (!latestOrder) return;

    const workflow = await prisma.workflow_instances.findFirst({
      where: {
        entity_type: "ORDER",
        entity_id: latestOrder.id
      },
      orderBy: { started_at: "desc" }
    });
    if (!workflow) return;

    await applyEvent(workflow.id, "JOB_DONE", payload.senderId);
  } catch (error) {
    logger.warn("chat_workflow_command_failed", {
      command: payload.command,
      error: error.message
    });
  }
});
