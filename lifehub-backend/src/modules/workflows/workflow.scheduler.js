import { ensureWorkflowSchedulers } from "./workflow.jobs.js";

export async function startWorkflowSchedulers() {
  await ensureWorkflowSchedulers();
}


