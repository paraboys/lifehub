import {
  createSelfTestNotification,
  createNotification,
  deliverPendingBatch,
  listUserNotifications,
  getNotificationPreferences,
  updateNotificationPreferences
} from "./notification.service.js";
import { jsonSafe } from "../../common/utils/jsonSafe.js";

export async function createNotificationApi(req, res) {
  try {
    const notification = await createNotification({
      userId: req.body.userId || req.user?.id,
      eventType: req.body.eventType,
      priority: req.body.priority,
      payload: req.body.payload || {},
      channels: req.body.channels || []
    });
    res.status(201).json(jsonSafe(notification));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function listMyNotifications(req, res) {
  try {
    const items = await listUserNotifications(req.user.id, req.query.limit);
    res.json(jsonSafe({ notifications: items }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function triggerDeliveryScan(req, res) {
  try {
    await deliverPendingBatch(Number(req.body.limit || 100));
    res.json({ message: "Notification delivery scan completed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getMyPreferences(req, res) {
  try {
    const prefs = await getNotificationPreferences(req.user.id);
    res.json(jsonSafe(prefs));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateMyPreferences(req, res) {
  try {
    const prefs = await updateNotificationPreferences(req.user.id, req.body || {});
    res.json(jsonSafe(prefs));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function sendMyTestNotification(req, res) {
  try {
    const notification = await createSelfTestNotification(
      req.user.id,
      req.body?.channels || []
    );
    res.status(201).json(jsonSafe(notification));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
