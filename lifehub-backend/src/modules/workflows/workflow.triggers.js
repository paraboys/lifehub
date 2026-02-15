import { on } from "./workflow.bus.js";
import { applyTransition } from "./workflow.service.js";

// Legacy in-process bus bridge kept for backward compatibility.
on("STATE_CHANGE", async ({ instanceId, nextState }) => {
  await applyTransition(instanceId, nextState, null, {
    source: "legacy.workflow.bus"
  });
});
