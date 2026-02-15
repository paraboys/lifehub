import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware.js";
import { abuseGuard } from "../../common/security/abuseGuard.js";
import { authorize } from "../../common/middlewares/role.middleware.js";
import { createIntent, getIntent, confirmIntent, webhook } from "./payment.controller.js";

const router = Router();

router.post(
  "/intents",
  authenticate,
  authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"),
  abuseGuard("payments"),
  createIntent
);

router.get(
  "/intents/:intentId",
  authenticate,
  authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"),
  abuseGuard("payments"),
  getIntent
);
router.post(
  "/intents/:intentId/confirm",
  authenticate,
  authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"),
  abuseGuard("payments"),
  confirmIntent
);

router.post("/webhooks/:provider", webhook);

export default router;
