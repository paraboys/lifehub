import { retry as resilientRetry } from "../../common/resilience/retry.js";

export async function retry(fn, options = {}) {
  return resilientRetry(fn, options);
}
