import { createRedisClient } from "../../config/redis.js";

const redis = createRedisClient("realtime-offline-events");

function streamKey(userId) {
  return `offline:user:${String(userId)}:events`;
}

function cursorKey(userId, deviceId) {
  return `offline:user:${String(userId)}:device:${String(deviceId)}:cursor`;
}

export async function enqueueOfflineEvent(userId, eventType, payload) {
  await redis.xadd(
    streamKey(userId),
    "MAXLEN",
    "~",
    2000,
    "*",
    "eventType",
    String(eventType),
    "payload",
    JSON.stringify(payload || {}),
    "at",
    String(Date.now())
  );
}

export async function replayOfflineEvents(userId, deviceId, { cursor, limit = 200 } = {}) {
  const fromCursor = cursor || (await redis.get(cursorKey(userId, deviceId))) || "-";
  const raw = await redis.xrange(streamKey(userId), `(${fromCursor}`, "+", "COUNT", Math.min(Math.max(Number(limit) || 200, 1), 1000));

  const events = raw.map(([id, fields]) => {
    const obj = {};
    for (let i = 0; i < fields.length; i += 2) {
      obj[fields[i]] = fields[i + 1];
    }
    return {
      id,
      eventType: obj.eventType,
      payload: obj.payload ? JSON.parse(obj.payload) : {},
      at: Number(obj.at || 0)
    };
  });

  const lastId = events.length ? events[events.length - 1].id : fromCursor;
  if (lastId && lastId !== "-") {
    await redis.set(cursorKey(userId, deviceId), lastId, "EX", 86400 * 30);
  }

  return {
    cursor: lastId,
    events
  };
}
