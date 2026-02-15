import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware.js";
import { authorize } from "../../common/middlewares/role.middleware.js";
import {
  createNotificationApi,
  listMyNotifications,
  triggerDeliveryScan,
  getMyPreferences,
  updateMyPreferences,
  sendMyTestNotification
} from "./notification.controller.js";

const router = Router();

router.post("/", authenticate, authorize("ADMIN", "BUSINESS"), createNotificationApi);
router.get("/me", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), listMyNotifications);
router.post("/me/test", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), sendMyTestNotification);
router.get("/preferences/me", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), getMyPreferences);
router.put("/preferences/me", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), updateMyPreferences);
router.post("/ops/delivery-scan", authenticate, authorize("ADMIN"), triggerDeliveryScan);

export default router;
