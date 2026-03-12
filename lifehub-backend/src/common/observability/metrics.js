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

const eventStreamDlqSize = new client.Gauge({
  name: "event_stream_dlq_size",
  help: "Current size of event stream DLQ"
});

const eventStreamGroupLag = new client.Gauge({
  name: "event_stream_group_lag",
  help: "Event stream consumer group lag",
  labelNames: ["group"]
});

const eventStreamGroupPending = new client.Gauge({
  name: "event_stream_group_pending",
  help: "Event stream consumer group pending count",
  labelNames: ["group"]
});

const eventStreamReplayTotal = new client.Counter({
  name: "event_stream_replay_total",
  help: "Total event stream replay actions",
  labelNames: ["mode"]
});

const eventStreamReplayFailed = new client.Counter({
  name: "event_stream_replay_failed_total",
  help: "Total failed event stream replay actions",
  labelNames: ["mode"]
});

register.registerMetric(httpRequestDurationMs);
register.registerMetric(workflowEventsTotal);
register.registerMetric(dlqEnqueueTotal);
register.registerMetric(eventStreamDlqSize);
register.registerMetric(eventStreamGroupLag);
register.registerMetric(eventStreamGroupPending);
register.registerMetric(eventStreamReplayTotal);
register.registerMetric(eventStreamReplayFailed);

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

export function setEventStreamStats({ dlqLength = 0, groups = [] } = {}) {
  eventStreamDlqSize.set(Number(dlqLength || 0));
  for (const group of groups || []) {
    const name = String(group?.name || "unknown");
    const lag = Number(group?.lag || 0);
    const pending = Number(group?.pending || 0);
    eventStreamGroupLag.labels(name).set(lag);
    eventStreamGroupPending.labels(name).set(pending);
  }
}

export function incEventStreamReplay(mode = "stream") {
  eventStreamReplayTotal.labels(String(mode)).inc();
}

export function incEventStreamReplayFailed(mode = "stream") {
  eventStreamReplayFailed.labels(String(mode)).inc();
}

export async function metricsHandler(_, res) {
  res.setHeader("Content-Type", register.contentType);
  res.end(await register.metrics());
}
