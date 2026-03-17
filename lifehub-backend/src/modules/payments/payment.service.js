import crypto from "crypto";
import {
  createGatewayIntent,
  parseWebhookEvent,
  verifyPaymentSignature,
  verifyWebhookSignature
} from "./payment.gateway.js";
import { topupWallet } from "../transactions/transaction.service.js";
import { eventBus } from "../../common/events/eventBus.js";
import { getSharedRedisClient } from "../../config/redis.js";

const redis = getSharedRedisClient();
const memoryIntentStore = new Map();
const memoryProviderIntentStore = new Map();
const memorySettledStore = new Map();

const INTENT_TTL_SECONDS = Math.max(Number(process.env.PAYMENT_INTENT_TTL_SECONDS || 86400), 600);

function newIntentId() {
  return `pi_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function intentKey(intentId) {
  return `payment:intent:${intentId}`;
}

function providerIntentKey(provider, providerIntentId) {
  return `payment:provider:${provider}:${providerIntentId}`;
}

function settledKey(provider, providerPaymentId) {
  return `payment:settled:${provider}:${providerPaymentId}`;
}

function expiresAtTs() {
  return Date.now() + INTENT_TTL_SECONDS * 1000;
}

function saveMemoryIntent(payload) {
  const expiresAt = expiresAtTs();
  memoryIntentStore.set(payload.intentId, { payload, expiresAt });
  memoryProviderIntentStore.set(providerIntentKey(payload.provider, payload.providerIntentId), {
    intentId: payload.intentId,
    expiresAt
  });
}

function readMemoryIntent(intentId) {
  const row = memoryIntentStore.get(intentId);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    memoryIntentStore.delete(intentId);
    return null;
  }
  return row.payload;
}

function readMemoryIntentByProvider(provider, providerIntentId) {
  const row = memoryProviderIntentStore.get(providerIntentKey(provider, providerIntentId));
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    memoryProviderIntentStore.delete(providerIntentKey(provider, providerIntentId));
    return null;
  }
  return readMemoryIntent(row.intentId);
}

function markMemorySettled(provider, providerPaymentId) {
  const key = settledKey(provider, providerPaymentId);
  const existing = memorySettledStore.get(key);
  if (existing && existing > Date.now()) {
    return false;
  }
  memorySettledStore.set(key, expiresAtTs());
  return true;
}

async function saveIntent(payload) {
  saveMemoryIntent(payload);
  try {
    await redis.set(intentKey(payload.intentId), JSON.stringify(payload), "EX", INTENT_TTL_SECONDS);
    await redis.set(
      providerIntentKey(payload.provider, payload.providerIntentId),
      payload.intentId,
      "EX",
      INTENT_TTL_SECONDS
    );
  } catch {
    // in-memory mirror remains available
  }
}

async function getIntentById(intentId) {
  try {
    const raw = await redis.get(intentKey(intentId));
    if (raw) return JSON.parse(raw);
  } catch {
    // fall back to in-memory store when redis is unavailable
  }
  return readMemoryIntent(intentId);
}

async function getIntentByProvider(provider, providerIntentId) {
  try {
    const id = await redis.get(providerIntentKey(provider, providerIntentId));
    if (id) return getIntentById(id);
  } catch {
    // fall back to in-memory store when redis is unavailable
  }
  return readMemoryIntentByProvider(provider, providerIntentId);
}

async function markIntentSettled(intent) {
  const next = {
    ...intent,
    status: "SUCCEEDED",
    settledAt: new Date().toISOString()
  };
  await saveIntent(next);
  return next;
}

async function settleIntent({
  intent,
  providerPaymentId
}) {
  let dedupe = null;
  try {
    dedupe = await redis.set(
      settledKey(intent.provider, providerPaymentId),
      "1",
      "EX",
      INTENT_TTL_SECONDS,
      "NX"
    );
  } catch {
    dedupe = markMemorySettled(intent.provider, providerPaymentId) ? "OK" : null;
  }
  if (!dedupe) {
    return { duplicate: true, intentId: intent.intentId };
  }

  if (intent.status !== "SUCCEEDED" && intent.purpose === "TOPUP") {
    await topupWallet({
      userId: intent.userId,
      amount: intent.amount,
      referenceId: undefined
    });
    eventBus.emit("PAYMENT.INTENT_SETTLED", {
      intentId: intent.intentId,
      provider: intent.provider,
      userId: intent.userId,
      amount: intent.amount
    });
  }

  const updated = await markIntentSettled({
    ...intent,
    providerPaymentId
  });
  return {
    settled: true,
    intentId: updated.intentId
  };
}

export async function createPaymentIntent({
  userId,
  amount,
  purpose = "TOPUP",
  provider = "RAZORPAY",
  paymentMethod = "UPI",
  currency = "INR",
  metadata = {}
}) {
  const normalizedProvider = String(provider || "RAZORPAY").toUpperCase();
  const normalizedMethod = String(paymentMethod || "UPI").toUpperCase();
  const normalizedPurpose = String(purpose || "TOPUP").toUpperCase();
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Amount must be a positive number");
  }
  if (normalizedPurpose !== "TOPUP") {
    throw new Error("Only TOPUP purpose is supported in current gateway flow");
  }

  const intentId = newIntentId();
  const gateway = await createGatewayIntent({
    provider: normalizedProvider,
    intentId,
    amount: numericAmount,
    currency,
    metadata: {
      userId: String(userId),
      purpose: normalizedPurpose,
      method: normalizedMethod,
      ...metadata
    }
  });

  const intent = {
    intentId,
    userId: String(userId),
    amount: Number(numericAmount.toFixed(2)),
    currency: String(currency || "INR").toUpperCase(),
    purpose: normalizedPurpose,
    provider: normalizedProvider,
    paymentMethod: normalizedMethod,
    providerIntentId: gateway.providerIntentId,
    status: "PENDING",
    createdAt: new Date().toISOString()
  };

  await saveIntent(intent);

  return {
    ...intent,
    checkout: gateway.checkout
  };
}

export async function getPaymentIntent(intentId) {
  return getIntentById(intentId);
}

export async function processWebhook({
  provider,
  rawBody,
  body,
  headers
}) {
  const normalizedProvider = String(provider || "").toUpperCase();
  const valid = verifyWebhookSignature({
    provider: normalizedProvider,
    rawBody,
    headers
  });
  if (!valid) {
    throw new Error("Invalid webhook signature");
  }

  const event = parseWebhookEvent({
    provider: normalizedProvider,
    body
  });
  if (!event?.providerIntentId || !event?.providerPaymentId) {
    return { ignored: true };
  }

  const intent = await getIntentByProvider(normalizedProvider, event.providerIntentId);
  if (!intent) {
    return { ignored: true };
  }

  return settleIntent({
    intent,
    providerPaymentId: event.providerPaymentId
  });
}

export async function confirmPaymentIntent({
  intentId,
  userId,
  providerIntentId,
  providerPaymentId,
  signature
}) {
  const intent = await getIntentById(intentId);
  if (!intent) throw new Error("Payment intent not found");
  if (String(intent.userId) !== String(userId)) {
    throw new Error("Payment intent access denied");
  }
  if (String(intent.status || "").toUpperCase() === "SUCCEEDED") {
    return {
      settled: true,
      intentId: intent.intentId,
      alreadySettled: true
    };
  }

  if (String(intent.providerIntentId) !== String(providerIntentId)) {
    throw new Error("Provider intent mismatch");
  }
  const valid = verifyPaymentSignature({
    provider: intent.provider,
    providerIntentId,
    providerPaymentId,
    signature
  });
  if (!valid) throw new Error("Invalid payment signature");

  return settleIntent({
    intent,
    providerPaymentId
  });
}
