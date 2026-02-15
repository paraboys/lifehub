import prisma from "../../config/db.js";
import { normalizeBigInt } from "../../common/utils/bigint.js";
import { resolveUserNotificationChannels } from "./notification.preferences.js";
import { deliverByChannel } from "./notification.channels.js";
import {
  getUserNotificationPreferences,
  setUserNotificationPreferences
} from "./notification.preferences.store.js";

async function ensureChannel(channelName) {
  return prisma.notification_channels.upsert({
    where: { channel_name: channelName },
    update: {},
    create: { channel_name: channelName }
  });
}

function normalizePriority(priority = "HIGH") {
  const allowed = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
  const normalized = String(priority || "HIGH").toUpperCase();
  return allowed.has(normalized) ? normalized : "HIGH";
}

function normalizeStatus(status = "PENDING") {
  const allowed = new Set(["PENDING", "SENT", "FAILED", "FAILED_FINAL"]);
  return allowed.has(status) ? status : "PENDING";
}

function isInQuietHours(pref) {
  if (!pref?.quietHours?.enabled) return false;
  const start = Number(pref.quietHours.startHour);
  const end = Number(pref.quietHours.endHour);
  const hour = new Date().getUTCHours();

  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function applyPreferenceRules({
  eventType,
  priority,
  userPreferences,
  channels
}) {
  let resolved = [...channels];
  const eventRule = userPreferences?.perEventRules?.[eventType];

  if (eventRule?.disableAll) {
    return [];
  }

  if (Array.isArray(eventRule?.channels) && eventRule.channels.length) {
    resolved = [...new Set(eventRule.channels.map(v => String(v).toUpperCase()))];
  }

  if (isInQuietHours(userPreferences) && String(priority).toUpperCase() !== "CRITICAL") {
    resolved = resolved.filter(ch => ch === "IN_APP");
  }

  return resolved;
}

export async function createNotification({
  userId,
  eventType,
  priority = "HIGH",
  payload = {},
  channels = []
}) {
  const safePayload = normalizeBigInt(payload);
  const normalizedPriority = normalizePriority(priority);
  const userPreferences = userId
    ? await getUserNotificationPreferences(userId)
    : null;

  const resolvedChannels = resolveUserNotificationChannels({
    priority: normalizedPriority,
    overrides: channels
  });
  const finalChannels = applyPreferenceRules({
    eventType,
    priority: normalizedPriority,
    userPreferences,
    channels: resolvedChannels
  });

  const notification = await prisma.notifications.create({
    data: {
      user_id: userId ? BigInt(userId) : null,
      event_type: String(eventType || "GENERIC.EVENT"),
      content: JSON.stringify(safePayload),
      priority: normalizedPriority
    }
  });

  const channelRows = await Promise.all(
    finalChannels.map(channelName => ensureChannel(channelName))
  );

  if (channelRows.length) {
    await prisma.notification_deliveries.createMany({
      data: channelRows.map(channel => ({
        notification_id: notification.id,
        channel_id: channel.id,
        status: "PENDING",
        attempts: 0
      }))
    });
  }

  return notification;
}

export async function getPendingDeliveries(limit = 100) {
  return prisma.notification_deliveries.findMany({
    where: {
      OR: [{ status: "PENDING" }, { status: "FAILED" }]
    },
    include: {
      notification_channels: true,
      notifications: true
    },
    take: Math.min(Math.max(Number(limit) || 100, 1), 500)
  });
}

export async function markDelivery({
  notificationId,
  channelId,
  status,
  attempts
}) {
  return prisma.notification_deliveries.update({
    where: {
      notification_id_channel_id: {
        notification_id: BigInt(notificationId),
        channel_id: Number(channelId)
      }
    },
    data: {
      status: normalizeStatus(status),
      attempts: Number(attempts || 0),
      last_attempt: new Date()
    }
  });
}

export async function deliverPendingBatch(limit = 100) {
  const deliveries = await getPendingDeliveries(limit);

  for (const delivery of deliveries) {
    const attempts = Number(delivery.attempts || 0) + 1;
    try {
      let context = { attempts };
      const targetUserId = delivery.notifications?.user_id;
      if (targetUserId) {
        const user = await prisma.users.findUnique({
          where: { id: BigInt(targetUserId) },
          select: { phone: true, email: true }
        });
        context = {
          ...context,
          userId: String(targetUserId),
          phoneTo: user?.phone || undefined,
          emailTo: user?.email || undefined
        };
      }
      await deliverByChannel(
        delivery.notification_channels.channel_name,
        delivery.notifications,
        context
      );

      await markDelivery({
        notificationId: delivery.notification_id,
        channelId: delivery.channel_id,
        status: "SENT",
        attempts
      });
    } catch (error) {
      await markDelivery({
        notificationId: delivery.notification_id,
        channelId: delivery.channel_id,
        status: attempts >= 5 ? "FAILED_FINAL" : "FAILED",
        attempts
      });

      if (attempts >= 5) {
        await prisma.analytics_events.create({
          data: {
            event_type: "NOTIFICATION.DELIVERY_FAILED_FINAL",
            entity_type: "NOTIFICATION",
            entity_id: delivery.notification_id,
            metadata: {
              channel: delivery.notification_channels.channel_name,
              error: error.message
            }
          }
        });
      }
    }
  }
}

export async function listUserNotifications(userId, limit = 50) {
  return prisma.notifications.findMany({
    where: { user_id: BigInt(userId) },
    orderBy: { created_at: "desc" },
    take: Math.min(Math.max(Number(limit) || 50, 1), 200)
  });
}

export async function getNotificationPreferences(userId) {
  return getUserNotificationPreferences(userId);
}

export async function updateNotificationPreferences(userId, data) {
  return setUserNotificationPreferences(userId, data);
}

export async function createSelfTestNotification(userId, channels = []) {
  return createNotification({
    userId,
    eventType: "SYSTEM.NOTIFICATION_TEST",
    priority: "MEDIUM",
    payload: {
      message: "LifeHub notification channels are active.",
      generatedAt: new Date().toISOString()
    },
    channels
  });
}
