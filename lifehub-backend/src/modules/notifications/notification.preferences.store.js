import IORedis from "ioredis";

let redis;

function getRedis() {
  if (redis) return redis;
  redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null
  });
  return redis;
}

function prefKey(userId) {
  return `notif:pref:${String(userId)}`;
}

const DEFAULT_PREF = {
  quietHours: {
    enabled: false,
    startHour: 22,
    endHour: 7,
    timezone: "UTC"
  },
  perEventRules: {},
  channelPriority: ["PUSH", "IN_APP", "EMAIL", "SMS"]
};

export async function getUserNotificationPreferences(userId) {
  const raw = await getRedis().get(prefKey(userId));
  if (!raw) return DEFAULT_PREF;
  try {
    return { ...DEFAULT_PREF, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREF;
  }
}

export async function setUserNotificationPreferences(userId, data) {
  const merged = {
    ...DEFAULT_PREF,
    ...(data || {}),
    quietHours: {
      ...DEFAULT_PREF.quietHours,
      ...(data?.quietHours || {})
    },
    perEventRules: {
      ...DEFAULT_PREF.perEventRules,
      ...(data?.perEventRules || {})
    }
  };

  await getRedis().set(prefKey(userId), JSON.stringify(merged));
  return merged;
}
