import client from "prom-client";

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDurationMs = new client.Histogram({
  name: "http_request_duration_ms",
  help: "HTTP request duration in ms",
  labelNames: ["method", "route", "status_code"],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2000]
});

const workflowEventsTotal = new client.Counter({
  name: "workflow_events_total",
  help: "Total workflow events",
  labelNames: ["event_type"]
});

const dlqEnqueueTotal = new client.Counter({
  name: "workflow_dlq_enqueue_total",
  help: "Total jobs pushed to workflow DLQ",
  labelNames: ["job_name"]
});

register.registerMetric(httpRequestDurationMs);
register.registerMetric(workflowEventsTotal);
register.registerMetric(dlqEnqueueTotal);

export function httpMetricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const route = req.route?.path || req.path || "unknown";
    httpRequestDurationMs.labels(req.method, route, String(res.statusCode)).observe(durationMs);
  });
  next();
}

export function incWorkflowEvent(eventType) {
  workflowEventsTotal.labels(String(eventType)).inc();
}

export function incDlqEnqueue(jobName) {
  dlqEnqueueTotal.labels(String(jobName || "unknown")).inc();
}

export async function metricsHandler(_, res) {
  res.setHeader("Content-Type", register.contentType);
  res.end(await register.metrics());
}
