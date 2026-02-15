import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

const storage = new AsyncLocalStorage();

export function getTraceId() {
  return storage.getStore()?.traceId || null;
}

export function tracingMiddleware(req, res, next) {
  const incoming = req.headers["x-trace-id"];
  const traceId = incoming ? String(incoming) : crypto.randomUUID();

  storage.run({ traceId }, () => {
    req.traceId = traceId;
    res.setHeader("x-trace-id", traceId);
    next();
  });
}
