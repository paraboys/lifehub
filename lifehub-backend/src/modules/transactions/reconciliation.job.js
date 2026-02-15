import { logger } from "../../common/observability/logger.js";
import { runFinancialReconciliation } from "./transaction.service.js";

let timer = null;

export function startFinancialReconciliationJob() {
  if (timer) return;

  const intervalMs = Math.max(
    Number(process.env.FIN_RECON_INTERVAL_MS || 24 * 60 * 60 * 1000),
    60 * 1000
  );

  timer = setInterval(async () => {
    try {
      const result = await runFinancialReconciliation();
      logger.info("financial_reconciliation_completed", {
        checkedOrders: result.checkedOrders,
        mismatchCount: result.mismatchCount
      });
    } catch (error) {
      logger.error("financial_reconciliation_failed", {
        error: error.message
      });
    }
  }, intervalMs);
}

export function stopFinancialReconciliationJob() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
