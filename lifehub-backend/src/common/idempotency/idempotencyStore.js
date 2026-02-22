import { normalizeBigInt } from "../utils/bigint.js";
import { getSharedRedisClient } from "../../config/redis.js";

let client;

function redis() {
  if (client) return client;
  client = getSharedRedisClient();
  return client;
}

function pendingKey(scope, key) {
  return `idem:${scope}:${key}:pending`;
}

function resultKey(scope, key) {
  return `idem:${scope}:${key}:result`;
}

export async function reserveIdempotency(scope, key, ttlSeconds = 300) {
  const res = await redis().set(pendingKey(scope, key), "1", "EX", ttlSeconds, "NX");
  return res === "OK";
}

export async function storeIdempotencyResult(scope, key, result, ttlSeconds = 3600) {
  const payload = JSON.stringify(normalizeBigInt(result));
  await redis().set(resultKey(scope, key), payload, "EX", ttlSeconds);
  await redis().del(pendingKey(scope, key));
}

export async function getIdempotencyResult(scope, key) {
  const raw = await redis().get(resultKey(scope, key));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
