import "../modules/orders/order.events.js";
import "../modules/service-requests/serviceRequest.events.js";
import "../modules/chat/chat.events.js";
import "../modules/workflows/workflow.triggers.js";
import "../modules/workflows/workflow.branch.worker.js";

export function initDomainSubscriptions() {
  return true;
}
