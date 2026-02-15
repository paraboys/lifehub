const STATE_POLICIES = {
  PAYMENT_PENDING: {
    sla: {
      breachSeconds: 600,
      escalations: [
        { afterSeconds: 600, action: "NOTIFY_L1" },
        { afterSeconds: 1200, action: "NOTIFY_L2" },
        { afterSeconds: 1800, action: "ESCALATE_MANAGER" }
      ]
    },
    autoTransition: {
      event: "PAYMENT_TIMEOUT",
      delaySeconds: 900
    }
  },
  ASSIGNED: {
    sla: {
      breachSeconds: 300,
      escalations: [
        { afterSeconds: 300, action: "NOTIFY_L1" },
        { afterSeconds: 900, action: "NOTIFY_L2" }
      ]
    },
    autoTransition: {
      event: "ASSIGNMENT_TIMEOUT",
      delaySeconds: 600
    }
  },
  OUT_FOR_DELIVERY: {
    sla: {
      breachSeconds: 7200,
      escalations: [
        { afterSeconds: 7200, action: "NOTIFY_L2" },
        { afterSeconds: 10800, action: "ESCALATE_MANAGER" }
      ]
    }
  }
};

const SYSTEM_POLICIES = {
  stuckWorkflowThresholdSeconds: Number(process.env.WORKFLOW_STUCK_THRESHOLD_SECONDS || 1800),
  staleEscalationEventWindowSeconds: Number(process.env.SLA_ESCALATION_EVENT_WINDOW_SECONDS || 3600)
};

export function getStatePolicy(stateName) {
  if (!stateName) return null;
  return STATE_POLICIES[stateName] || null;
}

export function getSlaPolicy(stateName) {
  return getStatePolicy(stateName)?.sla || null;
}

export function getAllStatePolicies() {
  return STATE_POLICIES;
}

export function getSystemPolicies() {
  return SYSTEM_POLICIES;
}
