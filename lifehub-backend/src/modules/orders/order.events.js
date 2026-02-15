import prisma from "../../config/db.js";
import { eventBus } from "../../common/events/eventBus.js";
import {
  releaseOrderEscrow,
  refundOrderEscrow
} from "../transactions/transaction.service.js";

eventBus.on("WORKFLOW.STATE_CHANGED", async (event) => {

  if (event.entityType !== "ORDER") return;

  const stateId = BigInt(event.toState);

  const state = await prisma.workflow_states.findUnique({
    where: { id: stateId }
  });

  if (!state) return;

  await prisma.orders.update({
    where: { id: BigInt(event.entityId) },
    data: { status: state.state_name }
  });

  const nextStatus = String(state.state_name || "").toUpperCase();
  if (["COMPLETED", "DELIVERED"].includes(nextStatus)) {
    await releaseOrderEscrow({ orderId: event.entityId });
  } else if (nextStatus.includes("CANCEL") || nextStatus.includes("FAIL")) {
    await refundOrderEscrow({ orderId: event.entityId });
  }

});
