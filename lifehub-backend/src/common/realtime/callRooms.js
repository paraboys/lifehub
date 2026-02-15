import IORedis from "ioredis";

const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null
});

function roomKey(roomId) {
  return `call:room:${roomId}:meta`;
}

function participantsKey(roomId) {
  return `call:room:${roomId}:participants`;
}

function participantStateKey(roomId, userId) {
  return `call:room:${roomId}:participant:${userId}`;
}

export async function createCallRoom({ roomId, createdBy, type = "video" }) {
  const now = Date.now();
  await redis.hset(roomKey(roomId), {
    roomId: String(roomId),
    createdBy: String(createdBy),
    type: String(type),
    createdAt: String(now),
    status: "ACTIVE"
  });
  await redis.expire(roomKey(roomId), 60 * 60 * 24);
}

export async function joinCallRoom({ roomId, userId, deviceId }) {
  await redis.sadd(participantsKey(roomId), String(userId));
  await redis.hset(participantStateKey(roomId, userId), {
    userId: String(userId),
    deviceId: String(deviceId || "unknown-device"),
    joinedAt: String(Date.now()),
    state: "CONNECTED"
  });
  await redis.expire(participantsKey(roomId), 60 * 60 * 24);
  await redis.expire(participantStateKey(roomId, userId), 60 * 60 * 24);
}

export async function leaveCallRoom({ roomId, userId }) {
  await redis.srem(participantsKey(roomId), String(userId));
  await redis.hset(participantStateKey(roomId, userId), {
    userId: String(userId),
    leftAt: String(Date.now()),
    state: "LEFT"
  });
}

export async function listCallParticipants(roomId) {
  return redis.smembers(participantsKey(roomId));
}

export async function getCallRoom(roomId) {
  const meta = await redis.hgetall(roomKey(roomId));
  if (!Object.keys(meta).length) return null;
  const participants = await listCallParticipants(roomId);
  return {
    ...meta,
    participants
  };
}

export async function endCallRoom(roomId) {
  await redis.hset(roomKey(roomId), {
    status: "ENDED",
    endedAt: String(Date.now())
  });
}
