import { Router } from "express";
import { authenticate } from "../../common/middlewares/auth.middleware.js";
import { authorize } from "../../common/middlewares/role.middleware.js";
import {
  dlqList,
  dlqRequeue,
  dlqRequeueBatch,
  streamList,
  streamReplay,
  streamHealth
} from "./events.controller.js";

const router = Router();

router.get("/ops/stream-health", authenticate, authorize("ADMIN"), streamHealth);
router.get("/ops/stream", authenticate, authorize("ADMIN"), streamList);
router.post("/ops/stream/replay", authenticate, authorize("ADMIN"), streamReplay);
router.get("/ops/dlq", authenticate, authorize("ADMIN"), dlqList);
router.post("/ops/dlq/:eventId/requeue", authenticate, authorize("ADMIN"), dlqRequeue);
router.post("/ops/dlq/requeue", authenticate, authorize("ADMIN"), dlqRequeueBatch);

export default router;
