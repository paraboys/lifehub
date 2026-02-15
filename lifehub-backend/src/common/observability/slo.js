import { logger } from "./logger.js";

const state = {
  totalRequests: 0,
  errorRequests: 0
};

export function sloCaptureMiddleware(req, res, next) {
  res.on("finish", () => {
    state.totalRequests += 1;
    if (res.statusCode >= 500) state.errorRequests += 1;
  });
  next();
}

export function startSloMonitor() {
  const intervalMs = Number(process.env.SLO_EVAL_INTERVAL_MS || 60000);
  const target = Number(process.env.SLO_SUCCESS_RATE_TARGET || 99.0);

  setInterval(() => {
    if (state.totalRequests === 0) return;

    const successRate =
      ((state.totalRequests - state.errorRequests) / state.totalRequests) * 100;

    if (successRate < target) {
      logger.warn("SLO breach detected", {
        successRate,
        target,
        totalRequests: state.totalRequests,
        errorRequests: state.errorRequests
      });
    } else {
      logger.info("SLO check passed", {
        successRate,
        target
      });
    }

    state.totalRequests = 0;
    state.errorRequests = 0;
  }, intervalMs);
}
