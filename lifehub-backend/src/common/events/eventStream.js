import os from "os";
import { normalizeBigInt } from "../utils/bigint.js";
import { logger } from "../observability/logger.js";
import { createRedisClient } from "../../config/redis.js";

const STREAM_KEY = process.env.EVENT_STREAM_KEY || "lifehub:events";
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

let redis;
let running = false;

function getRedis() {
  if (redis) return redis;
  redis = createRedisClient("event-stream");
  return redis;
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
}

async function consumeGroup(groupName, consumerName, handlers) {
  await ensureGroup(groupName);

  while (running) {
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

    for (const [id, fields] of entries) {
      const pairs = {};
      for (let i = 0; i < fields.length; i += 2) {
        pairs[fields[i]] = fields[i + 1];
      }

      const eventType = pairs.eventType;
      const payload = pairs.payload ? JSON.parse(pairs.payload) : {};
      const dedupeKey = `inbox:${groupName}:${id}`;
      const dedupe = await getRedis().set(dedupeKey, "1", "EX", 86400, "NX");

      if (!dedupe) {
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
        await getRedis().xack(STREAM_KEY, groupName, id);
      } catch (error) {
        logger.error("event_stream_handler_failed", {
          groupName,
          eventType,
          id,
          error: error.message
        });
      }
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
