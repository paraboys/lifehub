import prisma from "../../config/db.js";
import { jsonSafe } from "../../common/utils/jsonSafe.js";
import * as service from "./workflow.service.js";
import { applyTransition } from "./workflow.service.js";
import { getAllStatePolicies } from "./workflow.policies.js";
import {
  getWorkflowQueueStats,
  listDlqJobs,
  requeueDlqJob
} from "./workflow.jobs.js";

export async function transition(req, res) {
  try {
    const { instanceId, nextStateId } = req.body;
    if (!instanceId || !nextStateId) {
      return res.status(400).json({ error: "instanceId & nextStateId required" });
    }

    const flow = await applyTransition(
      BigInt(instanceId),
      BigInt(nextStateId),
      req.user?.id || null
    );

    res.json({ success: true, instance: jsonSafe(flow) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function start(req, res) {
  try {
    const flow = await service.startWorkflow(
      req.body.workflowId,
      req.body.entityType,
      req.body.entityId
    );
    res.json(jsonSafe(flow));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function move(req, res) {
  try {
    const { instanceId, nextStateId, delayMs, meta } = req.body;

    await service.moveWorkflow(instanceId, nextStateId, req.user?.id || null, {
      delayMs,
      meta
    });

    res.json({ message: delayMs ? "Workflow transition scheduled" : "Workflow moved" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function triggerEvent(req, res) {
  try {
    const { instanceId, event } = req.body;
    if (!instanceId || !event) {
      throw new Error("instanceId and event required");
    }

    await service.applyEvent(instanceId, event, req.user?.id || null);
    res.json({ message: "Event processed successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function graph(req, res) {
  try {
    const { workflowId } = req.params;
    if (!workflowId) {
      return res.status(400).json({ error: "workflowId required" });
    }

    const workflow = await prisma.workflows.findUnique({
      where: { id: BigInt(workflowId) },
      include: {
        workflow_states: true,
        workflow_transitions: true
      }
    });

    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    const policies = getAllStatePolicies();
    const statesWithPolicies = workflow.workflow_states.map(state => ({
      ...state,
      policy: policies[state.state_name] || null
    }));

    res.json(jsonSafe({
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description
      },
      states: statesWithPolicies,
      transitions: workflow.workflow_transitions
    }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function queueHealth(req, res) {
  try {
    const stats = await getWorkflowQueueStats();
    res.json(jsonSafe(stats));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function dlqList(req, res) {
  try {
    const limit = Number(req.query.limit || 20);
    const jobs = await listDlqJobs(limit);
    res.json(jsonSafe({ jobs }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function dlqRequeue(req, res) {
  try {
    const { jobId } = req.params;
    if (!jobId) return res.status(400).json({ error: "jobId required" });

    await requeueDlqJob(jobId);
    res.json({ message: "DLQ job requeued", jobId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
