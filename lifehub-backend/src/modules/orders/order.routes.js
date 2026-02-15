import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware.js";
import { abuseGuard } from "../../common/security/abuseGuard.js";
import { authorize } from "../../common/middlewares/role.middleware.js";
import {
  createOrder,
  listOrders,
  getOrder,
  cancelOrder,
  startDelivery,
  issueDeliveryOtp,
  confirmDelivery
} from "./order.controller.js";

const router = Router();

router.post("/", authenticate, authorize("CUSTOMER", "ADMIN"), abuseGuard("orders"), createOrder);
router.get("/", authenticate, authorize("CUSTOMER", "SHOPKEEPER", "DELIVERY", "ADMIN", "BUSINESS"), abuseGuard("orders"), listOrders);
router.get("/:orderId", authenticate, authorize("CUSTOMER", "SHOPKEEPER", "DELIVERY", "ADMIN", "BUSINESS"), abuseGuard("orders"), getOrder);
router.post("/:orderId/cancel", authenticate, authorize("CUSTOMER", "ADMIN"), abuseGuard("orders"), cancelOrder);
router.post("/:orderId/delivery/start", authenticate, authorize("SHOPKEEPER", "DELIVERY", "ADMIN", "BUSINESS"), abuseGuard("orders"), startDelivery);
router.post("/:orderId/delivery/otp", authenticate, authorize("SHOPKEEPER", "DELIVERY", "ADMIN", "BUSINESS"), abuseGuard("orders"), issueDeliveryOtp);
router.post("/:orderId/delivery/confirm", authenticate, authorize("CUSTOMER", "ADMIN"), abuseGuard("orders"), confirmDelivery);

export default router;
