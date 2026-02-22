import IORedis from "ioredis";
import { logger } from "../common/observability/logger.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REDIS_ERROR_LOG_COOLDOWN_MS = 60 * 1000;
const lastRedisErrorLogAt = new Map();
let sharedCommandClient = null;

function shouldLogRedisError(key) {
  const now = Date.now();
  const lastLoggedAt = lastRedisErrorLogAt.get(key) || 0;
  if ((now - lastLoggedAt) < REDIS_ERROR_LOG_COOLDOWN_MS) {
    return false;
  }
  lastRedisErrorLogAt.set(key, now);
  return true;
}

export function isRedisCapacityError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("max requests limit exceeded")
    || message.includes("quota")
    || message.includes("rate limit")
  );
}

export function createRedisClient(name = "default", options = {}) {
  const client = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000),
    ...options
  });

  client.on("error", error => {
    const message = String(error?.message || "Unknown Redis error");
    const key = `${name}:${message}`;
    if (!shouldLogRedisError(key)) return;

    if (isRedisCapacityError(error)) {
      logger.warn("redis_capacity_limited", {
        client: name,
        error: message
      });
      return;
    }

    logger.error("redis_client_error", {
      client: name,
      error: message
    });
  });

  return client;
}

export function getSharedRedisClient() {
  if (sharedCommandClient) return sharedCommandClient;
  sharedCommandClient = createRedisClient("shared-command-client");
  return sharedCommandClient;
}

export async function probeRedisConnection() {
  const probe = createRedisClient("startup-probe");
  try {
    await probe.ping();
    return true;
  } catch (error) {
    const key = `startup-probe:${String(error?.message || "unknown")}`;
    if (shouldLogRedisError(key)) {
      if (isRedisCapacityError(error)) {
        logger.warn("redis_probe_capacity_limited", {
          error: error?.message || "Redis capacity reached"
        });
      } else {
        logger.warn("redis_probe_unavailable", {
          error: error?.message || "Redis unavailable"
        });
      }
    }
    return false;
  } finally {
    try {
      await probe.quit();
    } catch {
      probe.disconnect();
    }
  }
}
