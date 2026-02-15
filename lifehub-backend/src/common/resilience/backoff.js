export function computeBackoffMs(attempt, options = {}) {
  const {
    type = "exponential",
    baseMs = 200,
    maxMs = 5000,
    jitter = 0.2
  } = options;

  let delayMs = baseMs;

  if (type === "exponential") {
    delayMs = baseMs * Math.pow(2, Math.max(0, attempt - 1));
  } else if (type === "linear") {
    delayMs = baseMs * attempt;
  }

  delayMs = Math.min(delayMs, maxMs);

  if (jitter > 0) {
    const variance = delayMs * jitter;
    delayMs = delayMs + (Math.random() * variance * 2 - variance);
  }

  return Math.max(0, Math.floor(delayMs));
}
