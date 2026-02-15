import {
  createNotification,
  deliverPendingBatch,
  getPendingDeliveries,
  markDelivery
} from "../notifications/notification.service.js";

function resolveUserId(payload = {}) {
  return payload.userId || payload.actionBy || null;
}

export async function dispatchWorkflowNotification({
  eventType,
  payload = {},
  severity = "HIGH"
}) {
  return createNotification({
    userId: resolveUserId(payload),
    eventType,
    priority: severity,
    payload
  });
}

export async function getPendingWorkflowDeliveries(limit = 100) {
  return getPendingDeliveries(limit);
}

export async function markWorkflowDelivery(args) {
  return markDelivery(args);
}

export async function runWorkflowNotificationDeliveryBatch(limit = 100) {
  return deliverPendingBatch(limit);
}
