import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware.js";
import { abuseGuard } from "../../common/security/abuseGuard.js";
import { authorize } from "../../common/middlewares/role.middleware.js";
import {
  assignProvider,
  cancelServiceRequest,
  completeServiceRequest,
  createServiceRequest,
  getServiceRequest,
  listServiceRequests
} from "./serviceRequest.controller.js";

const router = Router();

router.post("/", authenticate, authorize("CUSTOMER", "ADMIN"), abuseGuard("service_requests"), createServiceRequest);
router.get("/", authenticate, authorize("CUSTOMER", "PROVIDER", "ADMIN"), abuseGuard("service_requests"), listServiceRequests);
router.get("/:requestId", authenticate, authorize("CUSTOMER", "PROVIDER", "ADMIN"), abuseGuard("service_requests"), getServiceRequest);
router.post("/:requestId/assign", authenticate, authorize("ADMIN", "BUSINESS", "SHOPKEEPER"), abuseGuard("service_requests"), assignProvider);
router.post("/:requestId/cancel", authenticate, authorize("CUSTOMER", "PROVIDER", "ADMIN"), abuseGuard("service_requests"), cancelServiceRequest);
router.post("/:requestId/complete", authenticate, authorize("CUSTOMER", "PROVIDER", "ADMIN"), abuseGuard("service_requests"), completeServiceRequest);

export default router;
