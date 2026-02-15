const breakers = new Map();

function getBreakerState(key) {
  if (!breakers.has(key)) {
    breakers.set(key, {
      state: "CLOSED",
      failures: 0,
      openedAt: 0
    });
  }
  return breakers.get(key);
}

export function withCircuitBreaker(key, fn, options = {}) {
  const {
    failureThreshold = 5,
    openDurationMs = 10000,
    halfOpenMaxSuccesses = 2
  } = options;

  return async () => {
    const state = getBreakerState(key);

    if (state.state === "OPEN") {
      if (Date.now() - state.openedAt < openDurationMs) {
        throw new Error(`Circuit breaker open: ${key}`);
      }
      state.state = "HALF_OPEN";
      state.failures = 0;
      state.successes = 0;
    }

    try {
      const result = await fn();

      if (state.state === "HALF_OPEN") {
        state.successes += 1;
        if (state.successes >= halfOpenMaxSuccesses) {
          state.state = "CLOSED";
          state.failures = 0;
        }
      } else {
        state.failures = 0;
      }

      return result;
    } catch (error) {
      state.failures += 1;
      if (state.failures >= failureThreshold) {
        state.state = "OPEN";
        state.openedAt = Date.now();
      }
      throw error;
    }
  };
}
