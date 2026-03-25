import prisma from "../../config/db.js";
import {
  startWorkflow,
  applyEvent,
  applyTransition
} from "../workflows/workflow.service.js";
import {
  getIdempotencyResult,
  reserveIdempotency,
  storeIdempotencyResult
} from "../../common/idempotency/idempotencyStore.js";
import { eventBus } from "../../common/events/eventBus.js";
import {
  reserveFundsForOrder,
  refundOrderEscrow,
  releaseOrderEscrow
} from "../transactions/transaction.service.js";
import { createNotification } from "../notifications/notification.service.js";
import { getSharedRedisClient } from "../../config/redis.js";

const ORDER_WORKFLOW_ID = BigInt(process.env.ORDER_WORKFLOW_ID || 1);
const TABLE_AVAILABILITY_CACHE_TTL_MS = 60 * 1000;
let shopFeedbackTableAvailability = {
  checkedAt: 0,
  available: null
};
let productFeedbackTableAvailability = {
  checkedAt: 0,
  available: null
};
const redis = getSharedRedisClient();

function toBigInt(id) {
  return BigInt(id);
}

function isShopFeedbackTableMissingError(error) {
  const code = String(error?.code || "");
  const table = String(error?.meta?.table || "").toLowerCase();
  const column = String(error?.meta?.column || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    ["P2021", "P2022"].includes(code)
    || (message.includes("shop_feedbacks") && message.includes("does not exist"))
    || table.includes("shop_feedbacks")
    || column.includes("shop_feedbacks")
    || message.includes("relation \"shop_feedbacks\" does not exist")
  );
}

async function hasShopFeedbackTable() {
  const now = Date.now();
  if (
    shopFeedbackTableAvailability.available !== null
    && (now - shopFeedbackTableAvailability.checkedAt) < TABLE_AVAILABILITY_CACHE_TTL_MS
  ) {
    return shopFeedbackTableAvailability.available;
  }

  try {
    const rows = await prisma.$queryRawUnsafe("SELECT to_regclass('public.shop_feedbacks')::text AS table_name");
    const available = Boolean(rows?.[0]?.table_name);
    shopFeedbackTableAvailability = {
      checkedAt: now,
      available
    };
    return available;
  } catch {
    shopFeedbackTableAvailability = {
      checkedAt: now,
      available: false
    };
    return false;
  }
}

async function hasProductFeedbackTable() {
  const now = Date.now();
  if (
    productFeedbackTableAvailability.available !== null
    && (now - productFeedbackTableAvailability.checkedAt) < TABLE_AVAILABILITY_CACHE_TTL_MS
  ) {
    return productFeedbackTableAvailability.available;
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "product_feedbacks" (
        "id" BIGSERIAL PRIMARY KEY,
        "product_id" BIGINT NOT NULL,
        "user_id" BIGINT NOT NULL,
        "order_id" BIGINT,
        "rating" DECIMAL(2,1) NOT NULL,
        "comment" TEXT,
        "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "product_feedbacks_product_id_fkey"
          FOREIGN KEY ("product_id") REFERENCES "products"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "product_feedbacks_user_id_fkey"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "product_feedbacks_order_id_fkey"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "product_feedbacks_product_id_order_id_key"
      ON "product_feedbacks" ("product_id", "order_id")
    `);
    productFeedbackTableAvailability = {
      checkedAt: now,
      available: true
    };
    return true;
  } catch {
    productFeedbackTableAvailability = {
      checkedAt: now,
      available: false
    };
    return false;
  }
}

async function upsertProductFeedbackForOrder({
  orderId,
  actorId,
  rating,
  feedback
}) {
  if (!(await hasProductFeedbackTable())) {
    return;
  }

  const orderItems = await prisma.order_items.findMany({
    where: { order_id: toBigInt(orderId) },
    select: { product_id: true }
  });
  const productIds = [...new Set(
    orderItems
      .map(item => item.product_id)
      .filter(Boolean)
      .map(value => String(value))
  )];

  for (const productId of productIds) {
    await prisma.product_feedbacks.upsert({
      where: {
        product_id_order_id: {
          product_id: BigInt(productId),
          order_id: toBigInt(orderId)
        }
      },
      update: {
        rating: Number(Number(rating).toFixed(1)),
        comment: feedback
      },
      create: {
        product_id: BigInt(productId),
        user_id: toBigInt(actorId),
        order_id: toBigInt(orderId),
        rating: Number(Number(rating).toFixed(1)),
        comment: feedback
      }
    });
  }
}

function sanitizeText(value, { field, required = false, max = 300 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${field} is required`);
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    if (required) throw new Error(`${field} is required`);
    return null;
  }
  if (text.length > max) {
    throw new Error(`${field} must be ${max} characters or less`);
  }
  return text;
}

function normalizeDeliveryDetails(input = {}, fallbackUser = {}) {
  const details = input || {};
  const fallback = fallbackUser || {};

  const recipientName = sanitizeText(
    details.recipientName ?? details.fullName ?? fallback.name,
    { field: "recipientName", required: true, max: 120 }
  );
  const recipientPhone = sanitizeText(
    details.recipientPhone ?? details.phone ?? fallback.phone,
    { field: "recipientPhone", required: true, max: 20 }
  );

  const addressLine1 = sanitizeText(
    details.addressLine1 ?? details.address ?? details.deliveryAddress,
    { field: "addressLine1", required: true, max: 400 }
  );
  const nearbyLocation = sanitizeText(details.nearbyLocation ?? details.area, {
    field: "nearbyLocation",
    max: 200
  });
  const city = sanitizeText(details.city, { field: "city", max: 120 });
  const postalCode = sanitizeText(details.postalCode ?? details.pincode, {
    field: "postalCode",
    max: 20
  });
  const landmark = sanitizeText(details.landmark, { field: "landmark", max: 200 });
  const deliveryNote = sanitizeText(
    details.deliveryNote ?? details.notes ?? details.instructions,
    { field: "deliveryNote", max: 500 }
  );

  return {
    recipientName,
    recipientPhone,
    addressLine1,
    nearbyLocation,
    city,
    postalCode,
    landmark,
    deliveryNote
  };
}

export async function createOrder({
  userId,
  shopId,
  providerId,
  total,
  items = [],
  deliveryDetails = {},
  paymentMethod = "wallet",
  idempotencyKey
}) {
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

  const parsedShopId = shopId ? toBigInt(shopId) : null;
  const parsedProviderId = providerId ? toBigInt(providerId) : null;
  if (!shopId && !providerId) {
    throw new Error("shopId or providerId is required");
  }
  const customer = await prisma.users.findUnique({
    where: { id: toBigInt(userId) },
    select: { id: true, name: true, phone: true }
  });
  if (!customer) {
    throw new Error("User not found");
  }
  const normalizedDeliveryDetails = normalizeDeliveryDetails(deliveryDetails, customer);

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
        select: {
          id: true,
          shop_id: true,
          name: true,
          price: true,
          inventory: {
            select: {
              product_id: true,
              quantity: true
            }
          }
        },
        where: {
          id: { in: productIds },
          shop_id: parsedShopId
        }
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

    const finalItemPrice = computedTotal > 0 ? computedTotal : Number(total || 0);
    if (!Number.isFinite(finalItemPrice) || finalItemPrice <= 0) {
      throw new Error("Order total must be a positive number");
    }

    const taxRate = 0.05; // 5% GST
    const platformFeeRate = 0.02; // 2% fee
    const computedTax = Number((finalItemPrice * taxRate).toFixed(2));
    const computedPlatformFee = Number((finalItemPrice * platformFeeRate).toFixed(2));
    const finalTotal = finalItemPrice + computedTax + computedPlatformFee;

    const createdOrder = await tx.orders.create({
      data: {
        user_id: toBigInt(userId),
        shop_id: parsedShopId,
        provider_id: parsedProviderId,
        item_price: finalItemPrice,
        tax: computedTax,
        platform_fee: computedPlatformFee,
        total: finalTotal,
        payment_method: paymentMethod,
        payment_status: paymentMethod === 'wallet' ? 'PAID' : 'PENDING',
        status: "CREATED",
        order_delivery_details: {
          create: {
            recipient_name: normalizedDeliveryDetails.recipientName,
            recipient_phone: normalizedDeliveryDetails.recipientPhone,
            address_line1: normalizedDeliveryDetails.addressLine1,
            nearby_location: normalizedDeliveryDetails.nearbyLocation,
            city: normalizedDeliveryDetails.city,
            postal_code: normalizedDeliveryDetails.postalCode,
            landmark: normalizedDeliveryDetails.landmark,
            delivery_note: normalizedDeliveryDetails.deliveryNote
          }
        }
      },
      include: {
        order_delivery_details: true
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

    if (paymentMethod === 'wallet') {
      await reserveFundsForOrder({
        userId,
        orderId: createdOrder.id,
        amount: createdOrder.total,
        tx
      });
    }

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
  let where = {};
  
  if (status && status !== 'ALL') {
    if (status === 'ACTIVE') {
      where.status = { notIn: ['COMPLETED', 'CANCELLED', 'DELIVERED'] };
    } else {
      where.status = status.toUpperCase();
    }
  }

  if (normalized.includes("ADMIN") || normalized.includes("BUSINESS")) {
    // all orders
  } else if (normalized.includes("SHOPKEEPER")) {
    where.shop_profiles = {
      user_id: toBigInt(userId)
    };
  } else {
    where.OR = [
      { user_id: toBigInt(userId) },
      { shop_profiles: { user_id: toBigInt(userId) } }
    ];
  }

  return prisma.orders.findMany({
    where,
    include: {
      order_delivery_details: true,
      shop_profiles: true,
      order_items: {
        include: { products: true }
      }
    },
    orderBy: { created_at: "desc" },
    take: Math.min(Math.max(Number(limit) || 20, 1), 100)
  });
}

export async function getOrderById({ orderId, userId, roles = [] }) {
  const order = await prisma.orders.findUnique({
    where: { id: toBigInt(orderId) },
    include: {
      shop_profiles: true,
      order_delivery_details: true,
      order_items: {
        include: {
          products: true
        }
      }
    }
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
    include: {
      shop_profiles: true,
      order_delivery_details: true
    }
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

  const hasRating = rating !== undefined && rating !== null && String(rating).trim() !== "";
  const numericRating = hasRating ? Number(rating) : null;
  if (hasRating && (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5)) {
    throw new Error("Rating must be between 1 and 5");
  }
  const normalizedFeedback = feedback === undefined || feedback === null
    ? null
    : String(feedback).trim().slice(0, 1000);

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

  await releaseOrderEscrow({ orderId: order.id });

  await prisma.analytics_events.create({
    data: {
      event_type: "ORDER.FEEDBACK_SUBMITTED",
      entity_type: "ORDER",
      entity_id: order.id,
      user_id: toBigInt(actorId),
      metadata: {
        rating: numericRating,
        feedback: normalizedFeedback,
        shopId: String(order.shop_id || "")
      }
    }
  });

  if (hasRating && order.shop_id && await hasShopFeedbackTable()) {
    try {
      await prisma.shop_feedbacks.upsert({
        where: { order_id: order.id },
        update: {
          rating: Number(numericRating.toFixed(1)),
          comment: normalizedFeedback
        },
        create: {
          shop_id: order.shop_id,
          user_id: toBigInt(actorId),
          order_id: order.id,
          rating: Number(numericRating.toFixed(1)),
          comment: normalizedFeedback
        }
      });
      await syncShopRatingFromFeedback(order.shop_id);
    } catch (error) {
      if (!isShopFeedbackTableMissingError(error)) {
        throw error;
      }
    }
  }

  if (hasRating) {
    await upsertProductFeedbackForOrder({
      orderId: order.id,
      actorId,
      rating: numericRating,
      feedback: normalizedFeedback
    });
  }

  eventBus.emit("ORDER.DELIVERED", {
    orderId: order.id,
    userId: actorId,
    rating: numericRating
  });

  await createNotification({
    userId: order.shop_profiles?.user_id || null,
    eventType: "ORDER.DELIVERED",
    priority: "HIGH",
    payload: {
      orderId: String(order.id),
      rating: numericRating
    },
    channels: ["IN_APP", "PUSH", "SMS"]
  });

  return { orderId: String(order.id), status: "DELIVERED" };
}

async function syncShopRatingFromFeedback(shopId) {
  if (!(await hasShopFeedbackTable())) {
    return;
  }
  const aggregate = await prisma.shop_feedbacks.aggregate({
    where: { shop_id: shopId },
    _avg: { rating: true }
  });
  const avgRating = aggregate?._avg?.rating;
  await prisma.shop_profiles.update({
    where: { id: shopId },
    data: {
      rating: avgRating === null || avgRating === undefined
        ? null
        : Number(Number(avgRating).toFixed(1))
    }
  });
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

export async function generateInvoice(orderId) {
  const parsedId = toBigInt(orderId);
  const order = await prisma.orders.findUnique({
    where: { id: parsedId },
    include: { invoices: true }
  });

  if (!order) throw new Error("Order not found");
  if (order.invoices) return order.invoices;

  const invoiceNumber = `INV-${Date.now()}-${String(order.id)}`;
  
  const created = await prisma.invoices.create({
    data: {
      order_id: order.id,
      invoice_number: invoiceNumber
    }
  });

  eventBus.emit("INVOICE.GENERATED", {
    orderId: String(order.id),
    invoiceId: String(created.id)
  });

  return created;
}
