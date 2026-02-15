import { startInboxConsumers } from "../common/events/eventStream.js";
import { createNotification } from "../modules/notifications/notification.service.js";
import { logger } from "../common/observability/logger.js";

export async function initInboxConsumers() {
  await startInboxConsumers({
    notificationHandlers: {
      "ORDER.CREATED": async ({ payload }) => {
        await createNotification({
          userId: payload.userId || null,
          eventType: "ORDER.CREATED",
          priority: "MEDIUM",
          payload
        });
      },
      "ORDER.CANCELLED": async ({ payload }) => {
        await createNotification({
          userId: payload.userId || null,
          eventType: "ORDER.CANCELLED",
          priority: "HIGH",
          payload
        });
      },
      "SERVICE_REQUEST.CREATED": async ({ payload }) => {
        await createNotification({
          userId: payload.userId || null,
          eventType: "SERVICE_REQUEST.CREATED",
          priority: "MEDIUM",
          payload
        });
      },
      "SERVICE_REQUEST.ASSIGNED": async ({ payload }) => {
        await createNotification({
          userId: payload.userId || null,
          eventType: "SERVICE_REQUEST.ASSIGNED",
          priority: "HIGH",
          payload
        });
      },
      "SERVICE_REQUEST.CANCELLED": async ({ payload }) => {
        await createNotification({
          userId: payload.userId || null,
          eventType: "SERVICE_REQUEST.CANCELLED",
          priority: "HIGH",
          payload
        });
      },
      "SERVICE_REQUEST.COMPLETED": async ({ payload }) => {
        await createNotification({
          userId: payload.userId || null,
          eventType: "SERVICE_REQUEST.COMPLETED",
          priority: "MEDIUM",
          payload
        });
      },
      "ORDER.PAYMENT_RELEASED": async ({ payload }) => {
        await createNotification({
          userId: payload.toWallet || null,
          eventType: "ORDER.PAYMENT_RELEASED",
          priority: "MEDIUM",
          payload
        });
      },
      "ORDER.PAYMENT_REFUNDED": async ({ payload }) => {
        await createNotification({
          userId: payload.toWallet || null,
          eventType: "ORDER.PAYMENT_REFUNDED",
          priority: "HIGH",
          payload
        });
      },
      "WORKFLOW.STATE_CHANGED": async ({ payload }) => {
        await createNotification({
          userId: payload.actionBy || null,
          eventType: "WORKFLOW.STATE_CHANGED",
          priority: "MEDIUM",
          payload
        });
      },
      "PAYMENT.INTENT_SETTLED": async ({ payload }) => {
        await createNotification({
          userId: payload.userId || null,
          eventType: "PAYMENT.INTENT_SETTLED",
          priority: "HIGH",
          payload
        });
      },
      "ORDER.REFUND_ISSUED": async ({ payload }) => {
        await createNotification({
          userId: payload.actorId || null,
          eventType: "ORDER.REFUND_ISSUED",
          priority: "HIGH",
          payload
        });
      },
      "SHOP.PAYOUT_EXECUTED": async ({ payload }) => {
        await createNotification({
          userId: payload.shopkeeperId || null,
          eventType: "SHOP.PAYOUT_EXECUTED",
          priority: "HIGH",
          payload
        });
      },
      "FINANCE.RECONCILIATION_COMPLETED": async ({ payload }) => {
        await createNotification({
          userId: null,
          eventType: "FINANCE.RECONCILIATION_COMPLETED",
          priority: "MEDIUM",
          payload
        });
      }
    },
    chatHandlers: {
      "CHAT.MESSAGE_CREATED": async ({ payload }) => {
        logger.info("chat_event_consumed", {
          messageId: payload.id,
          conversationId: payload.conversation_id
        });
      }
    }
  });
}
