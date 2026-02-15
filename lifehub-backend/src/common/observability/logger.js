import { getTraceId } from "./tracing.js";

function log(level, message, meta = {}) {
  const record = {
    level,
    message,
    traceId: getTraceId(),
    ts: new Date().toISOString(),
    ...meta
  };
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

export const logger = {
  info(message, meta) {
    log("info", message, meta);
  },
  warn(message, meta) {
    log("warn", message, meta);
  },
  error(message, meta) {
    log("error", message, meta);
  }
};
