import prisma from "../../config/db.js";
import {
  startWorkflow,
  applyEvent,
  applyTransition
} from "../workflows/workflow.service.js";
import { eventBus } from "../../common/events/eventBus.js";

const SERVICE_WORKFLOW_ID = BigInt(
  process.env.SERVICE_WORKFLOW_ID || process.env.ORDER_WORKFLOW_ID || 1
);

function toBigInt(id) {
  return BigInt(id);
}

async function resolveProviderForSkill(serviceType) {
  if (!serviceType) return null;
  const provider = await prisma.provider_profiles.findFirst({
    where: {
      provider_locations: { is: { available: true } },
      provider_skills: {
        some: {
          skill_name: {
            contains: String(serviceType),
            mode: "insensitive"
          }
        }
      }
    },
    orderBy: [{ verified: "desc" }, { rating: "desc" }]
  });
  return provider;
}

export async function createServiceRequest({
  userId,
  serviceType,
  description,
  preferredProviderId
}) {
  if (!serviceType) {
    throw new Error("serviceType is required");
  }

  const created = await prisma.$transaction(async tx => {
    const request = await tx.service_requests.create({
      data: {
        user_id: toBigInt(userId),
        service_type: String(serviceType).trim(),
        description: description || null,
        status: "CREATED"
      }
    });

    let providerId = preferredProviderId ? toBigInt(preferredProviderId) : null;
    if (!providerId) {
      const candidate = await resolveProviderForSkill(serviceType);
      providerId = candidate?.id || null;
    }

    if (providerId) {
      await tx.assignments.upsert({
        where: {
          request_id_provider_id: {
            request_id: request.id,
            provider_id: providerId
          }
        },
        update: { assigned_at: new Date() },
        create: {
          request_id: request.id,
          provider_id: providerId
        }
      });

      await tx.service_requests.update({
        where: { id: request.id },
        data: { status: "ASSIGNED" }
      });
    }

    return {
      request,
      assignedProviderId: providerId
    };
  });

  const workflow = await startWorkflow(SERVICE_WORKFLOW_ID, "SERVICE_REQUEST", created.request.id);
  eventBus.emit("SERVICE_REQUEST.CREATED", {
    requestId: created.request.id,
    workflowInstanceId: workflow.id,
    userId: toBigInt(userId),
    serviceType: created.request.service_type
  });
  if (created.assignedProviderId) {
    eventBus.emit("SERVICE_REQUEST.ASSIGNED", {
      requestId: created.request.id,
      providerId: created.assignedProviderId,
      userId: toBigInt(userId)
    });
  }

  return {
    ...created,
    workflowInstanceId: workflow.id
  };
}

export async function listServiceRequests({ userId, status, limit = 50, roles = [] }) {
  const isProvider = roles.includes("PROVIDER");
  const isAdmin = roles.includes("ADMIN");
  const where = isProvider
    ? {
        assignments: {
          some: {
            provider_profiles: {
              user_id: toBigInt(userId)
            }
          }
        },
        ...(status ? { status: String(status).toUpperCase() } : {})
      }
    : isAdmin
      ? {
          ...(status ? { status: String(status).toUpperCase() } : {})
        }
    : {
        user_id: toBigInt(userId),
        ...(status ? { status: String(status).toUpperCase() } : {})
      };

  return prisma.service_requests.findMany({
    where,
    include: {
      assignments: {
        include: {
          provider_profiles: {
            include: {
              users: {
                select: {
                  id: true,
                  name: true,
                  phone: true
                }
              }
            }
          }
        }
      }
    },
    orderBy: { created_at: "desc" },
    take: Math.min(Math.max(Number(limit) || 50, 1), 200)
  });
}

export async function getServiceRequestById({ requestId, userId }) {
  const row = await prisma.service_requests.findUnique({
    where: { id: toBigInt(requestId) },
    include: {
      assignments: {
        include: {
          provider_profiles: {
            include: {
              users: {
                select: { id: true, name: true, phone: true, email: true }
              }
            }
          }
        }
      }
    }
  });
  if (!row || String(row.user_id) !== String(userId)) {
    throw new Error("Service request not found");
  }
  return row;
}

export async function getServiceRequestByActor({ requestId, userId, roles = [] }) {
  const row = await prisma.service_requests.findUnique({
    where: { id: toBigInt(requestId) },
    include: {
      assignments: {
        include: {
          provider_profiles: {
            include: {
              users: {
                select: { id: true, name: true, phone: true, email: true }
              }
            }
          }
        }
      }
    }
  });
  if (!row) throw new Error("Service request not found");

  const isAdmin = roles.includes("ADMIN");
  const isOwner = String(row.user_id) === String(userId);
  const isAssignedProvider = row.assignments.some(
    item => String(item.provider_profiles?.user_id) === String(userId)
  );

  if (!isAdmin && !isOwner && !isAssignedProvider) {
    throw new Error("Service request not found");
  }
  return row;
}

export async function assignProvider({ requestId, providerId }) {
  const reqId = toBigInt(requestId);
  const pId = toBigInt(providerId);

  const request = await prisma.service_requests.findUnique({
    where: { id: reqId }
  });
  if (!request) throw new Error("Service request not found");
  if (["CANCELLED", "COMPLETED"].includes(String(request.status || "").toUpperCase())) {
    throw new Error(`Request already ${request.status}`);
  }

  await prisma.assignments.upsert({
    where: {
      request_id_provider_id: {
        request_id: reqId,
        provider_id: pId
      }
    },
    update: { assigned_at: new Date() },
    create: {
      request_id: reqId,
      provider_id: pId
    }
  });

  const updated = await prisma.service_requests.update({
    where: { id: reqId },
    data: { status: "ASSIGNED" }
  });

  eventBus.emit("SERVICE_REQUEST.ASSIGNED", {
    requestId: reqId,
    providerId: pId,
    userId: updated.user_id
  });

  return updated;
}

export async function cancelServiceRequest({ requestId, userId, roles = [], reason }) {
  const request = await getServiceRequestByActor({
    requestId,
    userId,
    roles
  });
  if (["CANCELLED", "COMPLETED"].includes(String(request.status || "").toUpperCase())) {
    throw new Error(`Request already ${request.status}`);
  }

  const workflow = await prisma.workflow_instances.findFirst({
    where: {
      entity_type: "SERVICE_REQUEST",
      entity_id: request.id
    },
    orderBy: { started_at: "desc" }
  });
  if (workflow) {
    const cancelState = await ensureServiceCancellationTransition(workflow);
    try {
      await applyEvent(workflow.id, "REQUEST_CANCELLED", userId);
    } catch (error) {
      if (cancelState && String(error.message || "").includes("No transition for event")) {
        await applyTransition(workflow.id, cancelState.id, userId, {
          event: "REQUEST_CANCELLED",
          fallback: true
        });
      } else {
        throw error;
      }
    }
  }

  const updated = await prisma.service_requests.update({
    where: { id: request.id },
    data: { status: "CANCELLED" }
  });

  eventBus.emit("SERVICE_REQUEST.CANCELLED", {
    requestId: request.id,
    userId: toBigInt(userId),
    reason: reason || "USER_REQUESTED"
  });

  return updated;
}

async function ensureServiceCancellationTransition(instance) {
  const cancelState = await prisma.workflow_states.findFirst({
    where: {
      workflow_id: instance.workflow_id,
      state_name: "CANCELLED"
    }
  });
  if (!cancelState || instance.current_state === cancelState.id) {
    return cancelState;
  }

  const existing = await prisma.workflow_transitions.findFirst({
    where: {
      workflow_id: instance.workflow_id,
      from_state: instance.current_state,
      to_state: cancelState.id,
      trigger_event: "REQUEST_CANCELLED"
    }
  });
  if (!existing) {
    await prisma.workflow_transitions.create({
      data: {
        workflow_id: instance.workflow_id,
        from_state: instance.current_state,
        to_state: cancelState.id,
        trigger_event: "REQUEST_CANCELLED",
        requires_action: false
      }
    });
  }
  return cancelState;
}

export async function markServiceCompleted({ requestId, userId, roles = [] }) {
  const request = await getServiceRequestByActor({ requestId, userId, roles });
  if (String(request.status || "").toUpperCase() === "COMPLETED") {
    return request;
  }

  const workflow = await prisma.workflow_instances.findFirst({
    where: {
      entity_type: "SERVICE_REQUEST",
      entity_id: request.id
    },
    orderBy: { started_at: "desc" }
  });
  if (workflow) {
    await applyEvent(workflow.id, "JOB_DONE", userId);
  }

  const updated = await prisma.service_requests.update({
    where: { id: request.id },
    data: { status: "COMPLETED" }
  });

  eventBus.emit("SERVICE_REQUEST.COMPLETED", {
    requestId: request.id,
    userId: toBigInt(userId)
  });

  return updated;
}
