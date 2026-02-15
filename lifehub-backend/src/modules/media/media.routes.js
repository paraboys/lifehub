import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware.js";
import { abuseGuard } from "../../common/security/abuseGuard.js";
import { authorize } from "../../common/middlewares/role.middleware.js";
import { completeUpload, getFile, initUpload } from "./media.controller.js";

const router = Router();
const allowMediaRole = authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN");

router.post("/upload/init", authenticate, allowMediaRole, abuseGuard("media"), initUpload);
router.post("/upload/:fileId/complete", authenticate, allowMediaRole, abuseGuard("media"), completeUpload);
router.get("/files/:fileId", authenticate, allowMediaRole, abuseGuard("media"), getFile);

export default router;
