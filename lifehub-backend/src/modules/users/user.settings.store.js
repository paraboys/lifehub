import IORedis from "ioredis";

let redis;

function getRedis() {
  if (redis) return redis;
  redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null
  });
  return redis;
}

function key(userId) {
  return `user:settings:${String(userId)}`;
}

function upiOwnerKey(upiId) {
  return `upi:owner:${String(upiId || "").trim().toLowerCase()}`;
}

export const DEFAULT_USER_SETTINGS = {
  payments: {
    upiId: "",
    preferredTopupMethod: "WALLET",
    autoTopupThreshold: "",
    autoTopupAmount: ""
  },
  location: {
    shareLiveLocation: true,
    locationPrecision: "precise"
  },
  notifications: {
    inApp: true,
    push: true,
    sms: true,
    email: true,
    orderAlerts: true,
    marketing: false
  },
  ui: {
    compactMode: false,
    language: "en",
    messageDensity: "comfortable"
  },
  privacy: {
    lastSeenVisibility: "contacts",
    profilePhotoVisibility: "everyone",
    readReceipts: true
  },
  security: {
    sessionTimeoutMinutes: 120,
    loginAlerts: true
  },
  chat: {
    enterToSend: true,
    autoDownloadMedia: "wifi",
    defaultCallType: "video"
  }
};

function normalize(settings = {}) {
  return {
    ...DEFAULT_USER_SETTINGS,
    ...settings,
    payments: {
      ...DEFAULT_USER_SETTINGS.payments,
      ...(settings.payments || {})
    },
    location: {
      ...DEFAULT_USER_SETTINGS.location,
      ...(settings.location || {})
    },
    notifications: {
      ...DEFAULT_USER_SETTINGS.notifications,
      ...(settings.notifications || {})
    },
    ui: {
      ...DEFAULT_USER_SETTINGS.ui,
      ...(settings.ui || {})
    },
    privacy: {
      ...DEFAULT_USER_SETTINGS.privacy,
      ...(settings.privacy || {})
    },
    security: {
      ...DEFAULT_USER_SETTINGS.security,
      ...(settings.security || {})
    },
    chat: {
      ...DEFAULT_USER_SETTINGS.chat,
      ...(settings.chat || {})
    }
  };
}

function normalizeUpiId(upiId) {
  return String(upiId || "").trim().toLowerCase();
}

export async function getUserSettings(userId) {
  const raw = await getRedis().get(key(userId));
  if (!raw) return DEFAULT_USER_SETTINGS;
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export async function setUserSettings(userId, patch = {}) {
  const current = await getUserSettings(userId);
  const currentUpiId = normalizeUpiId(current?.payments?.upiId);
  const next = normalize({
    ...current,
    ...patch,
    payments: {
      ...current.payments,
      ...(patch.payments || {})
    },
    location: {
      ...current.location,
      ...(patch.location || {})
    },
    notifications: {
      ...current.notifications,
      ...(patch.notifications || {})
    },
    ui: {
      ...current.ui,
      ...(patch.ui || {})
    },
    privacy: {
      ...current.privacy,
      ...(patch.privacy || {})
    },
    security: {
      ...current.security,
      ...(patch.security || {})
    },
    chat: {
      ...current.chat,
      ...(patch.chat || {})
    }
  });

  const nextUpiId = normalizeUpiId(next?.payments?.upiId);
  const redisClient = getRedis();
  await redisClient.set(key(userId), JSON.stringify(next));
  if (currentUpiId && currentUpiId !== nextUpiId) {
    await redisClient.del(upiOwnerKey(currentUpiId));
  }
  if (nextUpiId) {
    await redisClient.set(upiOwnerKey(nextUpiId), String(userId));
  }
  return next;
}

export async function findUserIdByUpiId(upiId) {
  const normalized = normalizeUpiId(upiId);
  if (!normalized) return null;
  const value = await getRedis().get(upiOwnerKey(normalized));
  if (!value) return null;
  return String(value);
}
