import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware.js";
import { authorize } from "../../common/middlewares/role.middleware.js";
import { getProfile, getSettings, updateSettings } from "./user.controller.js";

const router = Router();

router.get("/me", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), getProfile);
router.get("/settings/me", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), getSettings);
router.put("/settings/me", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), updateSettings);

export default router;
