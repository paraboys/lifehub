import express from "express";
import http from "http";
import path from "node:path";
import { promises as fs } from "node:fs";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./modules/auth/auth.routes.js";
import prisma from "./config/db.js";
import workflowRoutes from "./modules/workflows/workflow.routes.js";
import { normalizeBigInt } from "./common/utils/bigint.js";
import orderRoutes from "./modules/orders/order.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";
import chatRoutes from "./modules/chat/chat.routes.js";
import userRoutes from "./modules/users/user.routes.js";
import marketplaceRoutes from "./modules/marketplace/marketplace.routes.js";
import superappRoutes from "./modules/superapp/superapp.routes.js";
import mediaRoutes from "./modules/media/media.routes.js";
import callRoutes from "./modules/calls/calls.routes.js";
import serviceRequestRoutes from "./modules/service-requests/serviceRequest.routes.js";
import transactionRoutes from "./modules/transactions/transaction.routes.js";
import paymentRoutes from "./modules/payments/payment.routes.js";
import { startWorkflowSchedulers } from "./modules/workflows/workflow.scheduler.js";
import { startWorkflowWorker } from "./modules/workflows/workflow.worker.js";
import { initWorkflowEvents } from "./modules/workflows/workflow.events.js";
import { initDomainSubscriptions } from "./bootstrap/domainSubscriptions.js";
import { initSocketServer } from "./common/realtime/socketHub.js";
import { initInboxConsumers } from "./bootstrap/inboxConsumers.js";
import { initOutboxBridge } from "./bootstrap/outboxBridge.js";
import { tracingMiddleware } from "./common/observability/tracing.js";
import { httpMetricsMiddleware, metricsHandler } from "./common/observability/metrics.js";
import { startSloMonitor, sloCaptureMiddleware } from "./common/observability/slo.js";
import { logger } from "./common/observability/logger.js";
import { startMediaWorker } from "./modules/media/media.worker.js";
import { startNotificationWorker } from "./modules/notifications/notification.worker.js";
import { startFinancialReconciliationJob } from "./modules/transactions/reconciliation.job.js";




dotenv.config();
await prisma.$connect();
logger.info("database_connected");
initDomainSubscriptions();
initOutboxBridge();

const app = express();
const server = http.createServer(app);
const localMediaRoot = path.resolve(process.cwd(), "storage");

function resolveLocalMediaPath(rawKey = "") {
  const key = String(rawKey || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!key || key.includes("..")) {
    throw new Error("Invalid media key");
  }
  return path.join(localMediaRoot, key);
}

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));
app.use(tracingMiddleware);
app.use(httpMetricsMiddleware);
app.use(sloCaptureMiddleware);

app.put(/^\/upload\/(.+)$/, express.raw({ type: "*/*", limit: "50mb" }), async (req, res) => {
  if ((process.env.MEDIA_STORAGE_PROVIDER || "local").toLowerCase() !== "local") {
    res.status(404).json({ error: "Local upload route disabled" });
    return;
  }
  try {
    const key = req.params[0];
    const target = resolveLocalMediaPath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, req.body);
    res.status(201).json({ message: "Uploaded" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get(/^\/cdn\/(.+)$/, async (req, res) => {
  if ((process.env.MEDIA_STORAGE_PROVIDER || "local").toLowerCase() !== "local") {
    res.status(404).json({ error: "Local CDN route disabled" });
    return;
  }
  try {
    const key = req.params[0];
    const target = resolveLocalMediaPath(key);
    await fs.access(target);
    res.sendFile(target);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

app.use(express.json({
  verify(req, _, buf) {
    req.rawBody = buf.toString("utf8");
  }
}));


app.use("/api/orders", orderRoutes);
app.use((req, res, next) => {
  const oldJson = res.json.bind(res);

  res.json = (data) => {
    oldJson(normalizeBigInt(data));
  };

  next();
});



app.use("/api/auth", authRoutes);
app.use("/api/workflows", workflowRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/users", userRoutes);
app.use("/api/marketplace", marketplaceRoutes);
app.use("/api/superapp", superappRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/service-requests", serviceRequestRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/payments", paymentRoutes);
app.get("/metrics", metricsHandler);
app.get("/", (_, res) => res.send("LifeHub API running"));

await initWorkflowEvents();
await startWorkflowSchedulers();
startWorkflowWorker();
startMediaWorker();
startNotificationWorker();
startFinancialReconciliationJob();
await initInboxConsumers();
startSloMonitor();
initSocketServer(server);

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, ()=> logger.info("server_started", { port: PORT }));
