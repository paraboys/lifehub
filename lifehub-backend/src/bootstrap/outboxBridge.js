import { eventBus } from "../common/events/eventBus.js";
import { publishOutboxEvent } from "../common/events/eventStream.js";

const BRIDGED_EVENTS = [
  "CHAT.MESSAGE_CREATED",
  "CHAT.WORKFLOW_COMMAND",
  "ORDER.CREATED",
  "ORDER.CANCELLED",
  "SERVICE_REQUEST.CREATED",
  "SERVICE_REQUEST.ASSIGNED",
  "SERVICE_REQUEST.CANCELLED",
  "SERVICE_REQUEST.COMPLETED",
  "ORDER.PAYMENT_HELD",
  "ORDER.PAYMENT_RELEASED",
  "ORDER.PAYMENT_REFUNDED",
  "ORDER.REFUND_ISSUED",
  "SHOP.PAYOUT_EXECUTED",
  "WORKFLOW.STATE_CHANGED",
  "PAYMENT.INTENT_SETTLED",
  "FINANCE.RECONCILIATION_COMPLETED"
];

export function initOutboxBridge() {
  for (const eventType of BRIDGED_EVENTS) {
    eventBus.on(eventType, async payload => {
      await publishOutboxEvent(eventType, payload);
    });
  }
}
