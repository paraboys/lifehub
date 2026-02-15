import prisma from "../../config/db.js";
import { eventBus } from "../../common/events/eventBus.js";

eventBus.on("WORKFLOW.STATE_CHANGED", async event => {
  if (event.entityType !== "SERVICE_REQUEST") return;

  const state = await prisma.workflow_states.findUnique({
    where: { id: BigInt(event.toState) }
  });
  if (!state?.state_name) return;

  await prisma.service_requests.update({
    where: { id: BigInt(event.entityId) },
    data: { status: state.state_name }
  });
});
