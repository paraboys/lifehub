import { createRedisClient } from "../../config/redis.js";

const redis = createRedisClient("chat-e2ee-store");

function bundleKey(userId, deviceId) {
  return `e2ee:bundle:${String(userId)}:${String(deviceId)}`;
}

function oneTimeKey(userId, deviceId) {
  return `e2ee:otk:${String(userId)}:${String(deviceId)}`;
}

export async function publishKeyBundle({
  userId,
  deviceId,
  identityKey,
  signedPreKey,
  oneTimePreKeys = []
}) {
  const payload = {
    userId: String(userId),
    deviceId: String(deviceId),
    identityKey,
    signedPreKey,
    updatedAt: Date.now()
  };

  await redis.set(bundleKey(userId, deviceId), JSON.stringify(payload), "EX", 60 * 60 * 24 * 30);

  if (Array.isArray(oneTimePreKeys) && oneTimePreKeys.length) {
    const multi = redis.multi();
    for (const item of oneTimePreKeys) {
      multi.rpush(oneTimeKey(userId, deviceId), JSON.stringify(item));
    }
    multi.expire(oneTimeKey(userId, deviceId), 60 * 60 * 24 * 30);
    await multi.exec();
  }

  return payload;
}

export async function getKeyBundle(userId, deviceId) {
  const raw = await redis.get(bundleKey(userId, deviceId));
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function consumeOneTimePreKey(userId, deviceId) {
  const raw = await redis.lpop(oneTimeKey(userId, deviceId));
  if (!raw) return null;
  return JSON.parse(raw);
}
