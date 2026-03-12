import { jsonSafe } from "../../common/utils/jsonSafe.js";
import {
  getEventStreamHealth,
  listStreamEvents,
  listDlqEvents,
  requeueDlqBatch,
  requeueDlqEvent,
  replayStreamEvents
} from "../../common/events/eventStream.js";

export async function streamHealth(req, res) {
  try {
    const payload = await getEventStreamHealth();
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function dlqList(req, res) {
  try {
    const limit = Number(req.query.limit || 50);
    const events = await listDlqEvents({ limit });
    res.json(jsonSafe({ events }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function streamList(req, res) {
  try {
    const limit = Number(req.query.limit || 100);
    const reverse = String(req.query.reverse || "false") === "true";
    const payload = await listStreamEvents({
      startId: req.query.startId || "0-0",
      endId: req.query.endId || "+",
      limit,
      reverse,
      eventTypes: req.query.eventTypes
    });
    res.json(jsonSafe({ events: payload }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function streamReplay(req, res) {
  try {
    const payload = await replayStreamEvents({
      startId: req.body?.startId || "0-0",
      endId: req.body?.endId || "+",
      limit: req.body?.limit || 100,
      eventTypes: req.body?.eventTypes,
      dryRun: Boolean(req.body?.dryRun)
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function dlqRequeue(req, res) {
  try {
    const payload = await requeueDlqEvent(req.params.eventId);
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function dlqRequeueBatch(req, res) {
  try {
    const limit = Number(req.body?.limit || req.query?.limit || 100);
    const payload = await requeueDlqBatch({ limit });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
