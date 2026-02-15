import { Router } from "express";
import {
  start,
  move,
  transition,
  triggerEvent,
  graph,
  queueHealth,
  dlqList,
  dlqRequeue
} from "./workflow.controller.js";
import { authenticate } from "../../common/middlewares/auth.middleware.js";
import { authorize } from "../../common/middlewares/role.middleware.js";

const router = Router();

router.post("/start", authenticate, authorize("ADMIN", "BUSINESS"), start);
router.post("/move", authenticate, authorize("ADMIN", "BUSINESS"), move);
router.post("/transition", authenticate, authorize("ADMIN", "BUSINESS"), transition);
router.post("/event", authenticate, authorize("ADMIN", "BUSINESS"), triggerEvent);
router.get("/ops/queue-health", authenticate, authorize("ADMIN"), queueHealth);
router.get("/ops/dlq", authenticate, authorize("ADMIN"), dlqList);
router.post("/ops/dlq/:jobId/requeue", authenticate, authorize("ADMIN"), dlqRequeue);
router.get("/:workflowId/graph", authenticate, authorize("CUSTOMER", "PROVIDER", "SHOPKEEPER", "DELIVERY", "BUSINESS", "ADMIN"), graph);


export default router;
