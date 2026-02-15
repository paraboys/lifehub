import { Router } from "express";
import {
  signup,
  login,
  refresh,
  logout,
  requestOtpLogin,
  loginWithOtp,
  sessions,
  revokeSession
} from "./auth.controller.js";
import { authLimiter } from "../../common/middlewares/rateLimiter.js";
import { abuseGuard } from "../../common/security/abuseGuard.js";
import { authenticate } from "../../common/middlewares/auth.middleware.js";

const router = Router();

router.post("/signup", abuseGuard("auth"), signup);
router.post("/login", authLimiter, abuseGuard("auth"), login);
router.post("/refresh", abuseGuard("auth"), refresh);
router.post("/logout", abuseGuard("auth"), logout);
router.post("/otp/request", abuseGuard("auth"), requestOtpLogin);
router.post("/otp/verify", abuseGuard("auth"), loginWithOtp);
router.get("/sessions", authenticate, abuseGuard("auth"), sessions);
router.delete("/sessions/:sessionId", authenticate, abuseGuard("auth"), revokeSession);


export default router;
