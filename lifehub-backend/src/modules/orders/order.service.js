import prisma from "../../config/db.js";
import {
  startWorkflow,
  applyEvent,
  applyTransition
} from "../workflows/workflow.service.js";
import IORedis from "ioredis";
import {
  getIdempotencyResult,
  reserveIdempotency,
  storeIdempotencyResult
} from "../../common/idempotency/idempotencyStore.js";
import { eventBus } from "../../common/events/eventBus.js";
import {
  reserveFundsForOrder,
  refundOrderEscrow
} from "../transactions/transaction.service.js";
import { createNotification } from "../notifications/notification.service.js";

const ORDER_WORKFLOW_ID = BigInt(process.env.ORDER_WORKFLOW_ID || 1);
const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null
});

function toBigInt(id) {
  return BigInt(id);
}

export async function createOrder({ userId, shopId, total, items = [], idempotencyKey }) {
  const scope = `orders:create:${userId}`;

  if (idempotencyKey) {
    const cached = await getIdempotencyResult(scope, idempotencyKey);
    if (cached) return cached;

    const reserved = await reserveIdempotency(scope, idempotencyKey, 120);
    if (!reserved) {
      const inFlight = await getIdempotencyResult(scope, idempotencyKey);
      if (inFlight) return inFlight;
      throw new Error("Duplicate request in progress. Retry shortly.");
    }
  }

  const parsedShopId = toBigInt(shopId);
  if (!shopId) {
    throw new Error("shopId is required");
  }

  const normalizedItems = items.map(item => {
    if (!item?.productId) {
      throw new Error("Each order item requires productId");
    }
    return {
      productId: BigInt(item.productId),
      quantity: Number(item.quantity || 0)
    };
  });

  const invalidItem = normalizedItems.find(item => !item.productId || item.quantity <= 0);
  if (invalidItem) {
    throw new Error("Invalid order item payload");
  }

  const order = await prisma.$transaction(async tx => {
    let computedTotal = Number(total || 0);
    let byProductId = new Map();

    if (normalizedItems.length) {
      const productIds = normalizedItems.map(item => item.productId);
      const products = await tx.products.findMany({
        where: {
          id: { in: productIds },
          shop_id: parsedShopId
        },
        include: { inventory: true }
      });

      if (products.length !== normalizedItems.length) {
        throw new Error("Some items are not available in this shop");
      }

      byProductId = new Map(products.map(product => [String(product.id), product]));
      computedTotal = 0;

      for (const item of normalizedItems) {
        const product = byProductId.get(String(item.productId));
        if (!product) throw new Error("Invalid product in order");
        const availableQty = Number(product.inventory?.quantity || 0);
        if (availableQty < item.quantity) {
          throw new Error(`Insufficient inventory for product ${product.name}`);
        }
        computedTotal += Number(product.price || 0) * item.quantity;
      }

      for (const item of normalizedItems) {
        const product = byProductId.get(String(item.productId));
        await tx.inventory.update({
          where: { product_id: item.productId },
          data: {
            quantity: {
              decrement: item.quantity
            },
            last_updated: new Date()
          }
        });
      }
    }

    const finalTotal = Number(total || computedTotal || 0);
    if (!Number.isFinite(finalTotal) || finalTotal <= 0) {
      throw new Error("Order total must be a positive number");
    }

    const createdOrder = await tx.orders.create({
      data: {
        user_id: toBigInt(userId),
        shop_id: parsedShopId,
        total: finalTotal,
        status: "CREATED"
      }
    });

    if (normalizedItems.length) {
      await tx.order_items.createMany({
        data: normalizedItems.map(item => ({
          order_id: createdOrder.id,
          product_id: item.productId,
            quantity: item.quantity,
            price: Number(byProductId.get(String(item.productId))?.price || 0)
          }))
      });
    }

    await reserveFundsForOrder({
      userId,
      orderId: createdOrder.id,
      amount: createdOrder.total,
      tx
    });

    return createdOrder;
  });

  const workflow = await startWorkflow(
    ORDER_WORKFLOW_ID,
    "ORDER",
    order.id
  );

  const response = { order, workflowInstanceId: workflow.id };
  eventBus.emit("ORDER.CREATED", {
    orderId: order.id,
    workflowInstanceId: workflow.id,
    userId
  });

  if (idempotencyKey) {
    await storeIdempotencyResult(scope, idempotencyKey, response);
  }

  return response;
}

export async function listOrders({ userId, roles = [], limit = 20, status }) {
  const normalized = roles.map(role => String(role).toUpperCase());
  const where = {
    ...(status ? { status } : {})
  };
  if (normalized.includes("ADMIN") || normalized.includes("BUSINESS")) {
    // all orders
  } else if (normalized.includes("SHOPKEEPER")) {
    where.shop_profiles = {
      user_id: toBigInt(userId)
    };
  } else {
    where.user_id = toBigInt(userId);
  }

  return prisma.orders.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: Math.min(Math.max(Number(limit) || 20, 1), 100)
  });
}

export async function getOrderById({ orderId, userId, roles = [] }) {
  const order = await prisma.orders.findUnique({
    where: { id: toBigInt(orderId) },
    include: { shop_profiles: true }
  });

  if (!order) {
    throw new Error("Order not found");
  }

  const normalized = roles.map(role => String(role).toUpperCase());
  const isAdmin = normalized.includes("ADMIN") || normalized.includes("BUSINESS");
  const isOwner = String(order.user_id) === String(userId);
  const isShopkeeper = normalized.includes("SHOPKEEPER") && String(order.shop_profiles?.user_id) === String(userId);
  const isDelivery = normalized.includes("DELIVERY");

  if (!isAdmin && !isOwner && !isShopkeeper && !isDelivery) {
    throw new Error("Order not found");
  }

  return order;
}

async function getOrderByActor({ orderId, userId, roles = [] }) {
  const order = await prisma.orders.findUnique({
    where: { id: toBigInt(orderId) },
    include: { shop_profiles: true }
  });
  if (!order) throw new Error("Order not found");

  const normalized = roles.map(role => String(role).toUpperCase());
  const isAdmin = normalized.includes("ADMIN") || normalized.includes("BUSINESS");
  const isOwner = String(order.user_id) === String(userId);
  const isShopkeeper = normalized.includes("SHOPKEEPER") && String(order.shop_profiles?.user_id) === String(userId);
  const isDelivery = normalized.includes("DELIVERY");

  if (!isAdmin && !isOwner && !isShopkeeper && !isDelivery) {
    throw new Error("Order not found");
  }
  return order;
}

export async function cancelOrder({ orderId, userId, reason }) {
  const order = await getOrderById({ orderId, userId });

  const lockedStates = new Set(["COMPLETED", "CANCELLED"]);
  if (lockedStates.has(order.status)) {
    throw new Error(`Order already ${order.status}`);
  }

  const instance = await prisma.workflow_instances.findFirst({
    where: {
      entity_type: "ORDER",
      entity_id: order.id
    },
    orderBy: { started_at: "desc" }
  });

  if (instance) {
    const cancelState = await ensureCancellationTransition(instance);
    try {
      await applyEvent(instance.id, "ORDER_CANCELLED", userId);
    } catch (error) {
      // Backfill cancellation path for older workflow graphs without cancel edges.
      if (cancelState && String(error.message || "").includes("No transition for event")) {
        await applyTransition(instance.id, cancelState.id, userId, {
          event: "ORDER_CANCELLED",
          fallback: true
        });
      } else {
        throw error;
      }
    }
  }

  const updated = await prisma.orders.update({
    where: { id: order.id },
    data: { status: "CANCELLED" }
  });

  await refundOrderEscrow({ orderId: order.id });

  await prisma.analytics_events.create({
    data: {
      event_type: "ORDER.CANCELLED",
      entity_type: "ORDER",
      entity_id: order.id,
      user_id: toBigInt(userId),
      metadata: {
        reason: reason || "USER_REQUESTED"
      }
    }
  });
  eventBus.emit("ORDER.CANCELLED", {
    orderId: order.id,
    userId,
    reason: reason || "USER_REQUESTED"
  });

  return updated;
}

export async function startOrderDelivery({ orderId, actorId, actorRoles = [] }) {
  const order = await getOrderByActor({
    orderId,
    userId: actorId,
    roles: actorRoles
  });

  const status = String(order.status || "").toUpperCase();
  if (["CANCELLED", "DELIVERED", "COMPLETED"].includes(status)) {
    throw new Error(`Order already ${order.status}`);
  }

  await prisma.delivery_tracking.upsert({
    where: { order_id: order.id },
    update: {
      status: "OUT_FOR_DELIVERY",
      updated_at: new Date()
    },
    create: {
      order_id: order.id,
      status: "OUT_FOR_DELIVERY"
    }
  });

  await prisma.orders.update({
    where: { id: order.id },
    data: { status: "OUT_FOR_DELIVERY" }
  });

  eventBus.emit("ORDER.OUT_FOR_DELIVERY", {
    orderId: order.id,
    userId: order.user_id,
    shopId: order.shop_id
  });

  await createNotification({
    userId: order.user_id,
    eventType: "ORDER.OUT_FOR_DELIVERY",
    priority: "HIGH",
    payload: {
      orderId: String(order.id)
    },
    channels: ["IN_APP", "PUSH", "SMS"]
  });

  return { orderId: order.id, status: "OUT_FOR_DELIVERY" };
}

export async function issueDeliveryOtp({ orderId, actorId, actorRoles = [] }) {
  const order = await getOrderByActor({
    orderId,
    userId: actorId,
    roles: actorRoles
  });

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const key = `order:delivery:otp:${String(order.id)}`;
  await redis.set(
    key,
    JSON.stringify({
      otp,
      orderId: String(order.id),
      customerId: String(order.user_id)
    }),
    "EX",
    Math.max(Number(process.env.DELIVERY_OTP_TTL_SECONDS || 900), 120)
  );

  await createNotification({
    userId: order.user_id,
    eventType: "ORDER.DELIVERY_OTP",
    priority: "CRITICAL",
    payload: {
      orderId: String(order.id),
      otp
    },
    channels: ["IN_APP", "SMS", "PUSH"]
  });

  return {
    orderId: String(order.id),
    expiresInSeconds: Math.max(Number(process.env.DELIVERY_OTP_TTL_SECONDS || 900), 120)
  };
}

export async function confirmDelivery({
  orderId,
  actorId,
  actorRoles = [],
  otp,
  rating,
  feedback
}) {
  const order = await getOrderByActor({
    orderId,
    userId: actorId,
    roles: actorRoles
  });
  if (String(order.user_id) !== String(actorId)) {
    throw new Error("Only customer can confirm delivery");
  }

  const key = `order:delivery:otp:${String(order.id)}`;
  const raw = await redis.get(key);
  if (!raw) throw new Error("Delivery OTP expired or missing");
  const payload = JSON.parse(raw);
  if (String(payload.otp) !== String(otp)) {
    throw new Error("Invalid delivery OTP");
  }

  await redis.del(key);
  await prisma.delivery_tracking.upsert({
    where: { order_id: order.id },
    update: {
      status: "DELIVERED",
      updated_at: new Date()
    },
    create: {
      order_id: order.id,
      status: "DELIVERED"
    }
  });
  await prisma.orders.update({
    where: { id: order.id },
    data: { status: "DELIVERED" }
  });

  await prisma.analytics_events.create({
    data: {
      event_type: "ORDER.FEEDBACK_SUBMITTED",
      entity_type: "ORDER",
      entity_id: order.id,
      user_id: toBigInt(actorId),
      metadata: {
        rating: rating ? Number(rating) : null,
        feedback: feedback || null,
        shopId: String(order.shop_id || "")
      }
    }
  });

  if (rating && order.shop_id) {
    const shop = await prisma.shop_profiles.findUnique({
      where: { id: order.shop_id }
    });
    const current = Number(shop?.rating || 0);
    const next = current > 0 ? Number(((current * 0.85) + (Number(rating) * 0.15)).toFixed(1)) : Number(rating);
    await prisma.shop_profiles.update({
      where: { id: order.shop_id },
      data: { rating: next }
    });
  }

  eventBus.emit("ORDER.DELIVERED", {
    orderId: order.id,
    userId: actorId,
    rating: rating ? Number(rating) : null
  });

  await createNotification({
    userId: order.shop_profiles?.user_id || null,
    eventType: "ORDER.DELIVERED",
    priority: "HIGH",
    payload: {
      orderId: String(order.id),
      rating: rating ? Number(rating) : null
    },
    channels: ["IN_APP", "PUSH", "SMS"]
  });

  return { orderId: String(order.id), status: "DELIVERED" };
}

async function ensureCancellationTransition(instance) {
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
      trigger_event: "ORDER_CANCELLED"
    }
  });

  if (!existing) {
    await prisma.workflow_transitions.create({
      data: {
        workflow_id: instance.workflow_id,
        from_state: instance.current_state,
        to_state: cancelState.id,
        trigger_event: "ORDER_CANCELLED",
        requires_action: false
      }
    });
  }

  return cancelState;
}
