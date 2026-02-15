import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware.js";
import { abuseGuard } from "../../common/security/abuseGuard.js";
import { authorize } from "../../common/middlewares/role.middleware.js";
import {
  list,
  topup,
  walletSummary,
  paymentOptions,
  orderRefund,
  orderPayout,
  reconcile
} from "./transaction.controller.js";

const router = Router();

router.get("/wallet", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), abuseGuard("transactions"), walletSummary);
router.get("/wallet/payment-options", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), abuseGuard("transactions"), paymentOptions);
router.post("/wallet/topup", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), abuseGuard("transactions"), topup);
router.get("/", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), abuseGuard("transactions"), list);
router.post("/orders/:orderId/refund", authenticate, authorize("CUSTOMER", "SHOPKEEPER", "BUSINESS", "ADMIN"), abuseGuard("transactions"), orderRefund);
router.post("/orders/:orderId/payout", authenticate, authorize("SHOPKEEPER", "BUSINESS", "ADMIN"), abuseGuard("transactions"), orderPayout);
router.post("/ops/reconcile", authenticate, authorize("BUSINESS", "ADMIN"), abuseGuard("transactions"), reconcile);

export default router;
