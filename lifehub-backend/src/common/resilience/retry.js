import { computeBackoffMs } from "./backoff.js";
import { withCircuitBreaker } from "./circuitBreaker.js";
import { eventBus } from "../events/eventBus.js";

export async function retry(fn, options = {}) {
  const {
    retries = 3,
    backoff = { type: "exponential", baseMs: 200, maxMs: 5000, jitter: 0.2 },
    breakerKey,
    breakerOptions,
    context = {}
  } = options;

  let lastError;

  const wrapped = breakerKey
    ? withCircuitBreaker(breakerKey, fn, breakerOptions)
    : fn;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      if (attempt > 1) {
        eventBus.emit("RETRY.ATTEMPT", {
          attempt,
          retries,
          context
        });
      }

      return await wrapped();
    } catch (error) {
      lastError = error;

      eventBus.emit("RETRY.FAILURE", {
        attempt,
        retries,
        error: error.message,
        context
      });

      if (attempt >= retries) break;

      const delayMs = computeBackoffMs(attempt, backoff);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
