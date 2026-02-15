import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware.js";
import { authorize } from "../../common/middlewares/role.middleware.js";
import { home } from "./superapp.controller.js";

const router = Router();

router.get("/home", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), home);

export default router;
