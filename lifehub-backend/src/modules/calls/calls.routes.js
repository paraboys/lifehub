import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware.js";
import { abuseGuard } from "../../common/security/abuseGuard.js";
import { authorize } from "../../common/middlewares/role.middleware.js";
import {
  callState,
  endCall,
  joinCall,
  leaveCall,
  rtcConfig,
  startCall
} from "./calls.controller.js";

const router = Router();
const allowCallRole = authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN");

router.get("/rtc-config", authenticate, allowCallRole, abuseGuard("calls"), rtcConfig);
router.post("/rooms", authenticate, allowCallRole, abuseGuard("calls"), startCall);
router.post("/rooms/:roomId/join", authenticate, allowCallRole, abuseGuard("calls"), joinCall);
router.post("/rooms/:roomId/leave", authenticate, allowCallRole, abuseGuard("calls"), leaveCall);
router.post("/rooms/:roomId/end", authenticate, allowCallRole, abuseGuard("calls"), endCall);
router.get("/rooms/:roomId", authenticate, allowCallRole, abuseGuard("calls"), callState);

export default router;
