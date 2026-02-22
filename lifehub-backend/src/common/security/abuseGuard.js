import { logger } from "../observability/logger.js";
import { getSharedRedisClient } from "../../config/redis.js";

const redis = getSharedRedisClient();

const WINDOW_SECONDS = Number(process.env.ABUSE_WINDOW_SECONDS || 60);
const LIMIT_IP = Number(process.env.ABUSE_LIMIT_IP || 120);
const LIMIT_DEVICE = Number(process.env.ABUSE_LIMIT_DEVICE || 100);
const LIMIT_USER = Number(process.env.ABUSE_LIMIT_USER || 90);
const BLOCK_SECONDS = Number(process.env.ABUSE_BLOCK_SECONDS || 600);

async function incrementBucket(key, windowSec) {
  const val = await redis.incr(key);
  if (val === 1) {
    await redis.expire(key, windowSec);
  }
  return val;
}

function scoreFromCounts({ ipCount, deviceCount, userCount }) {
  return (
    (ipCount / LIMIT_IP) * 30 +
    (deviceCount / LIMIT_DEVICE) * 30 +
    (userCount / LIMIT_USER) * 40
  );
}

export function abuseGuard(scope = "default") {
  return async (req, res, next) => {
    try {
      const ip = req.ip || "unknown-ip";
      const device = req.deviceId || req.headers["x-device-id"] || req.headers["user-agent"] || "unknown-device";
      const userId = req.user?.id || "anonymous";

      const blockKey = `abuse:block:${scope}:${ip}:${device}:${userId}`;
      const blocked = await redis.get(blockKey);
      if (blocked) {
        return res.status(429).json({ error: "Temporarily blocked due to abuse risk" });
      }

      const [ipCount, deviceCount, userCount] = await Promise.all([
        incrementBucket(`abuse:ip:${scope}:${ip}`, WINDOW_SECONDS),
        incrementBucket(`abuse:device:${scope}:${device}`, WINDOW_SECONDS),
        incrementBucket(`abuse:user:${scope}:${userId}`, WINDOW_SECONDS)
      ]);

      const riskScore = scoreFromCounts({ ipCount, deviceCount, userCount });
      req.abuseRiskScore = riskScore;

      if (
        ipCount > LIMIT_IP ||
        deviceCount > LIMIT_DEVICE ||
        userCount > LIMIT_USER ||
        riskScore >= 100
      ) {
        await redis.set(blockKey, "1", "EX", BLOCK_SECONDS);
        logger.warn("abuse_guard_blocked", {
          scope,
          ip,
          device,
          userId,
          ipCount,
          deviceCount,
          userCount,
          riskScore
        });
        return res.status(429).json({ error: "Request blocked by anti-abuse protection" });
      }

      next();
    } catch {
      next();
    }
  };
}
