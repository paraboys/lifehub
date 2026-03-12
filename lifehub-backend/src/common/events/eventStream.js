import os from "os";
import { normalizeBigInt } from "../utils/bigint.js";
import { logger } from "../observability/logger.js";
import {
  incEventStreamReplay,
  incEventStreamReplayFailed,
  setEventStreamStats
} from "../observability/metrics.js";
import { createRedisClient } from "../../config/redis.js";

const STREAM_KEY = process.env.EVENT_STREAM_KEY || "lifehub:events";
const DLQ_KEY = process.env.EVENT_STREAM_DLQ_KEY || "lifehub:events:dlq";
const INSTANCE_ID = process.env.SERVICE_INSTANCE_ID || `${os.hostname()}-${process.pid}`;
const GROUP_NOTIFICATION = process.env.EVENT_GROUP_NOTIFICATION || "notification-workers";
const GROUP_CHAT = process.env.EVENT_GROUP_CHAT || "chat-workers";
const EVENT_STREAM_BLOCK_MS = Math.max(
  Number(process.env.EVENT_STREAM_BLOCK_MS || 15000),
  3000
);
const EVENT_STREAM_READ_COUNT = Math.max(
  Number(process.env.EVENT_STREAM_READ_COUNT || 50),
  1
);
const EVENT_STREAM_MAX_RETRIES = Math.max(
  Number(process.env.EVENT_STREAM_MAX_RETRIES || 3),
  0
);
const EVENT_STREAM_RETRY_TTL_SEC = Math.max(
  Number(process.env.EVENT_STREAM_RETRY_TTL_SEC || 86400),
  3600
);
const EVENT_STREAM_AUTOCLAIM_IDLE_MS = Math.max(
  Number(process.env.EVENT_STREAM_AUTOCLAIM_IDLE_MS || 60000),
  10000
);
const EVENT_STREAM_AUTOCLAIM_BATCH = Math.max(
  Number(process.env.EVENT_STREAM_AUTOCLAIM_BATCH || 50),
  1
);
const EVENT_STREAM_AUTOCLAIM_INTERVAL_MS = Math.max(
  Number(process.env.EVENT_STREAM_AUTOCLAIM_INTERVAL_MS || 30000),
  5000
);
const EVENT_STREAM_THROTTLE_MS = Math.max(
  Number(process.env.EVENT_STREAM_THROTTLE_MS || 0),
  0
);
const EVENT_STREAM_METRICS_INTERVAL_MS = Math.max(
  Number(process.env.EVENT_STREAM_METRICS_INTERVAL_MS || 15000),
  5000
);

let redis;
let running = false;
let metricsTimer = null;

function getRedis() {
  if (redis) return redis;
  redis = createRedisClient("event-stream");
  return redis;
}

function parseXInfoRows(rows = []) {
  return rows.map(row => {
    const obj = {};
    for (let i = 0; i < row.length; i += 2) {
      obj[row[i]] = row[i + 1];
    }
    return obj;
  });
}

function parseStreamEntry([id, fields]) {
  const pairs = {};
  for (let i = 0; i < fields.length; i += 2) {
    pairs[fields[i]] = fields[i + 1];
  }

  let payload = {};
  try {
    payload = pairs.payload ? JSON.parse(pairs.payload) : {};
  } catch {
    payload = {};
  }

  return {
    id,
    eventType: pairs.eventType || "unknown",
    payload,
    publishedAt: pairs.publishedAt || null,
    publisher: pairs.publisher || null,
    error: pairs.error || null,
    groupName: pairs.groupName || null,
    originalId: pairs.originalId || null,
    failedAt: pairs.failedAt || null
  };
}

function normalizeEventTypes(eventTypes) {
  if (!eventTypes) return [];
  if (Array.isArray(eventTypes)) return eventTypes.map(type => String(type || "").trim()).filter(Boolean);
  return String(eventTypes)
    .split(",")
    .map(type => type.trim())
    .filter(Boolean);
}

function retryKey(groupName, id) {
  return `inbox:retry:${groupName}:${id}`;
}

function handledKey(groupName, id) {
  return `inbox:handled:${groupName}:${id}`;
}

async function pushToDlq({ id, eventType, payload, error, groupName }) {
  try {
    await getRedis().xadd(
      DLQ_KEY,
      "*",
      "eventType",
      String(eventType || "unknown"),
      "payload",
      JSON.stringify(payload || {}),
      "error",
      String(error || "unknown_error"),
      "groupName",
      String(groupName || "unknown"),
      "originalId",
      String(id || "unknown"),
      "failedAt",
      new Date().toISOString()
    );
  } catch (err) {
    logger.error("event_stream_dlq_publish_failed", {
      eventType,
      groupName,
      id,
      error: err?.message || "unknown"
    });
  }
}

async function handleFailure({ id, eventType, payload, groupName, error }) {
  try {
    if (EVENT_STREAM_MAX_RETRIES <= 0) {
      await pushToDlq({ id, eventType, payload, error, groupName });
      return;
    }

    const attempts = await getRedis().incr(retryKey(groupName, id));
    if (attempts === 1) {
      await getRedis().expire(retryKey(groupName, id), EVENT_STREAM_RETRY_TTL_SEC);
    }

    if (attempts <= EVENT_STREAM_MAX_RETRIES) {
      await getRedis().xadd(
        STREAM_KEY,
        "*",
        "eventType",
        String(eventType || "unknown"),
        "payload",
        JSON.stringify({
          ...(payload || {}),
          __retry: {
            attempts,
            originalId: id,
            groupName
          }
        }),
        "publishedAt",
        new Date().toISOString(),
        "publisher",
        String(INSTANCE_ID)
      );
      return;
    }

    await pushToDlq({ id, eventType, payload, error, groupName });
  } catch (err) {
    logger.error("event_stream_failure_handler_failed", {
      eventType,
      groupName,
      id,
      error: err?.message || "unknown"
    });
  }
}

async function ensureGroup(groupName) {
  try {
    await getRedis().xgroup("CREATE", STREAM_KEY, groupName, "$", "MKSTREAM");
  } catch (error) {
    if (!String(error.message).includes("BUSYGROUP")) {
      throw error;
    }
  }
}

export async function publishOutboxEvent(eventType, payload = {}) {
  const body = normalizeBigInt({
    eventType,
    payload,
    publishedAt: new Date().toISOString(),
    publisher: INSTANCE_ID
  });

  try {
    await getRedis().xadd(
      STREAM_KEY,
      "*",
      "eventType",
      String(body.eventType),
      "payload",
      JSON.stringify(body.payload),
      "publishedAt",
      String(body.publishedAt),
      "publisher",
      String(body.publisher)
    );
  } catch (error) {
    logger.error("event_stream_publish_failed", {
      eventType,
      error: error?.message || "unknown"
    });
  }
}

export async function getEventStreamHealth() {
  const client = getRedis();
  const [streamLength, dlqLength] = await Promise.all([
    client.xlen(STREAM_KEY).catch(() => 0),
    client.xlen(DLQ_KEY).catch(() => 0)
  ]);

  let groups = [];
  try {
    const raw = await client.xinfo("GROUPS", STREAM_KEY);
    groups = parseXInfoRows(raw);
  } catch {
    groups = [];
  }

  return {
    streamKey: STREAM_KEY,
    dlqKey: DLQ_KEY,
    streamLength,
    dlqLength,
    groups
  };
}

export async function listDlqEvents({ limit = 50 } = {}) {
  const rows = await getRedis().xrevrange(DLQ_KEY, "+", "-", "COUNT", Math.max(Number(limit) || 50, 1));
  return rows.map(parseStreamEntry);
}

export async function listStreamEvents({ startId = "0-0", endId = "+", limit = 100, reverse = false, eventTypes } = {}) {
  const types = normalizeEventTypes(eventTypes);
  const count = Math.max(Number(limit) || 100, 1);
  const rows = reverse
    ? await getRedis().xrevrange(STREAM_KEY, endId, startId, "COUNT", count)
    : await getRedis().xrange(STREAM_KEY, startId, endId, "COUNT", count);

  const events = rows.map(parseStreamEntry);
  if (!types.length) return events;
  return events.filter(entry => types.includes(String(entry.eventType)));
}

export async function replayStreamEvents({
  startId = "0-0",
  endId = "+",
  limit = 100,
  eventTypes,
  dryRun = false
} = {}) {
  const events = await listStreamEvents({ startId, endId, limit, eventTypes });
  if (dryRun) {
    return { replayed: 0, preview: events };
  }

  const results = [];
  for (const entry of events) {
    try {
      const payload = {
        ...(entry.payload || {}),
        __replay: {
          fromStream: true,
          originalId: entry.id
        }
      };

      const requeuedId = await getRedis().xadd(
        STREAM_KEY,
        "*",
        "eventType",
        String(entry.eventType || "unknown"),
        "payload",
        JSON.stringify(payload),
        "publishedAt",
        new Date().toISOString(),
        "publisher",
        String(INSTANCE_ID)
      );
      incEventStreamReplay("stream");
      results.push({ requeuedId, originalId: entry.id, eventType: entry.eventType });
    } catch (error) {
      incEventStreamReplayFailed("stream");
      logger.error("event_stream_replay_failed", {
        eventId: entry.id,
        eventType: entry.eventType,
        error: error?.message || "unknown"
      });
    }
  }

  return { replayed: results.length, items: results };
}
async function requeueDlqEntry(entry) {
  const payload = {
    ...(entry.payload || {}),
    __requeue: {
      fromDlq: true,
      originalId: entry.originalId || entry.id
    }
  };

  const requeuedId = await getRedis().xadd(
    STREAM_KEY,
    "*",
    "eventType",
    String(entry.eventType || "unknown"),
    "payload",
    JSON.stringify(payload),
    "publishedAt",
    new Date().toISOString(),
    "publisher",
    String(INSTANCE_ID)
  );

  await getRedis().xdel(DLQ_KEY, entry.id);

  return {
    requeuedId,
    originalId: entry.originalId || entry.id,
    eventType: entry.eventType
  };
}

export async function requeueDlqEvent(eventId) {
  const rows = await getRedis().xrange(DLQ_KEY, eventId, eventId);
  if (!rows.length) {
    throw new Error("DLQ event not found");
  }

  const entry = parseStreamEntry(rows[0]);
  return requeueDlqEntry(entry);
}

export async function requeueDlqBatch({ limit = 100 } = {}) {
  const rows = await getRedis().xrange(DLQ_KEY, "-", "+", "COUNT", Math.max(Number(limit) || 100, 1));
  if (!rows.length) return { requeued: 0, items: [] };

  const items = [];
  for (const row of rows) {
    const entry = parseStreamEntry(row);
    try {
      const res = await requeueDlqEntry(entry);
      items.push(res);
    } catch (error) {
      logger.error("event_stream_dlq_requeue_failed", {
        eventId: entry.id,
        error: error?.message || "unknown"
      });
    }
  }

  return { requeued: items.length, items };
}

export function startEventStreamMetrics() {
  if (metricsTimer) return;
  metricsTimer = setInterval(async () => {
    try {
      const health = await getEventStreamHealth();
      setEventStreamStats(health);
    } catch (error) {
      logger.warn("event_stream_metrics_failed", { error: error?.message || "unknown" });
    }
  }, EVENT_STREAM_METRICS_INTERVAL_MS);
}

export function stopEventStreamMetrics() {
  if (metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
  }
}

async function consumeGroup(groupName, consumerName, handlers) {
  await ensureGroup(groupName);
  let lastAutoclaimAt = 0;

  async function processEntries(entries = []) {
    for (const [id, fields] of entries) {
      const pairs = {};
      for (let i = 0; i < fields.length; i += 2) {
        pairs[fields[i]] = fields[i + 1];
      }

      const eventType = pairs.eventType;
      let payload = {};
      try {
        payload = pairs.payload ? JSON.parse(pairs.payload) : {};
      } catch {
        payload = {};
      }

      const alreadyHandled = await getRedis().get(handledKey(groupName, id));
      if (alreadyHandled) {
        await getRedis().xack(STREAM_KEY, groupName, id);
        continue;
      }

      try {
        const handler = handlers[eventType];
        if (handler) {
          await handler({
            id,
            eventType,
            payload
          });
        }
        await getRedis().set(handledKey(groupName, id), "1", "EX", 86400);
        await getRedis().xack(STREAM_KEY, groupName, id);
      } catch (error) {
        logger.error("event_stream_handler_failed", {
          groupName,
          eventType,
          id,
          error: error.message
        });
        await handleFailure({
          id,
          eventType,
          payload,
          groupName,
          error: error?.message || "unknown"
        });
        await getRedis().xack(STREAM_KEY, groupName, id);
      }
    }
  }

  while (running) {
    const now = Date.now();
    if (now - lastAutoclaimAt >= EVENT_STREAM_AUTOCLAIM_INTERVAL_MS) {
      lastAutoclaimAt = now;
      try {
        let nextId = "0-0";
        while (running) {
          const result = await getRedis().xautoclaim(
            STREAM_KEY,
            groupName,
            consumerName,
            EVENT_STREAM_AUTOCLAIM_IDLE_MS,
            nextId,
            "COUNT",
            EVENT_STREAM_AUTOCLAIM_BATCH
          );

          if (!result || result.length < 2) break;
          nextId = result[0];
          const entries = result[1] || [];
          if (!entries.length) break;
          await processEntries(entries);
          if (entries.length < EVENT_STREAM_AUTOCLAIM_BATCH) break;
        }
      } catch (error) {
        logger.warn("event_stream_autoclaim_failed", {
          groupName,
          error: error?.message || "unknown"
        });
      }
    }

    const result = await getRedis().xreadgroup(
      "GROUP",
      groupName,
      consumerName,
      "COUNT",
      EVENT_STREAM_READ_COUNT,
      "BLOCK",
      EVENT_STREAM_BLOCK_MS,
      "STREAMS",
      STREAM_KEY,
      ">"
    );

    if (!result || !result.length) continue;
    const [, entries] = result[0];
    await processEntries(entries);

    if (EVENT_STREAM_THROTTLE_MS > 0) {
      await new Promise(resolve => setTimeout(resolve, EVENT_STREAM_THROTTLE_MS));
    }
  }
}

export async function startInboxConsumers({ notificationHandlers = {}, chatHandlers = {} }) {
  running = true;
  const consumerName = INSTANCE_ID;

  if (Object.keys(notificationHandlers || {}).length) {
    consumeGroup(GROUP_NOTIFICATION, `${consumerName}:notification`, notificationHandlers).catch(error => {
      logger.error("notification_consumer_failed", { error: error.message });
    });
  }

  if (Object.keys(chatHandlers || {}).length) {
    consumeGroup(GROUP_CHAT, `${consumerName}:chat`, chatHandlers).catch(error => {
      logger.error("chat_consumer_failed", { error: error.message });
    });
  }
}

export function stopInboxConsumers() {
  running = false;
}
