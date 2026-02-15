import IORedis from "ioredis";
import { normalizeBigInt } from "../utils/bigint.js";
import os from "os";

let publisher;
let subscriber;
let enabled = false;
let eventHandler = null;
const instanceId =
  process.env.SERVICE_INSTANCE_ID || `${os.hostname()}-${process.pid}`;

function getPublisher() {
  if (publisher) return publisher;
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  publisher = new IORedis(url, { maxRetriesPerRequest: null });
  return publisher;
}

export function isRedisPipelineEnabled() {
  return enabled;
}

export async function initRedisPipeline() {
  enabled = (process.env.ENABLE_REDIS_EVENT_PIPELINE || "true") === "true";
  if (!enabled) return;
  getPublisher();
}

export async function startRedisEventSubscriber(onEvent) {
  if (!enabled) return;
  if (subscriber) return;

  eventHandler = onEvent;
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  const channel = process.env.REDIS_EVENT_CHANNEL || "lifehub.events";

  subscriber = new IORedis(url, { maxRetriesPerRequest: null });
  await subscriber.subscribe(channel);

  subscriber.on("message", (_, rawMessage) => {
    try {
      const parsed = JSON.parse(rawMessage);
      if (!parsed || parsed.sourceInstanceId === instanceId) return;
      if (!eventHandler) return;

      const payload = {
        ...(parsed.payload || {}),
        __pipeline: {
          ingested: true,
          transport: "redis",
          sourceInstanceId: parsed.sourceInstanceId || "unknown"
        }
      };

      eventHandler(parsed.eventType, payload);
    } catch {
      // Ignore malformed events and keep subscriber alive.
    }
  });
}

export async function publishRedisEvent(eventType, payload) {
  if (!enabled) return;
  const channel = process.env.REDIS_EVENT_CHANNEL || "lifehub.events";
  const safePayload = normalizeBigInt(payload);
  const message = JSON.stringify({
    eventType,
    payload: safePayload,
    sourceInstanceId: instanceId,
    emittedAt: new Date().toISOString()
  });
  await getPublisher().publish(channel, message);
}
