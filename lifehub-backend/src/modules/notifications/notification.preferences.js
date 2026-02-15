const DEFAULT_CHANNELS_BY_PRIORITY = {
  LOW: ["IN_APP"],
  MEDIUM: ["IN_APP", "PUSH"],
  HIGH: ["IN_APP", "PUSH", "EMAIL"],
  CRITICAL: ["IN_APP", "PUSH", "EMAIL", "SMS"]
};

export function resolveUserNotificationChannels({ priority = "HIGH", overrides = [] }) {
  if (Array.isArray(overrides) && overrides.length) {
    return [...new Set(overrides.map(v => String(v).toUpperCase()))];
  }
  const key = String(priority || "HIGH").toUpperCase();
  return DEFAULT_CHANNELS_BY_PRIORITY[key] || DEFAULT_CHANNELS_BY_PRIORITY.HIGH;
}
