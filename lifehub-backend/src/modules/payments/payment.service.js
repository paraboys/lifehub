import crypto from "crypto";
import {
  createGatewayIntent,
  parseWebhookEvent,
  verifyPaymentSignature,
  verifyWebhookSignature
} from "./payment.gateway.js";
import { topupWallet } from "../transactions/transaction.service.js";
import { eventBus } from "../../common/events/eventBus.js";
import { createRedisClient } from "../../config/redis.js";

const redis = createRedisClient("payment-service");

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

async function saveIntent(payload) {
  await redis.set(intentKey(payload.intentId), JSON.stringify(payload), "EX", INTENT_TTL_SECONDS);
  await redis.set(
    providerIntentKey(payload.provider, payload.providerIntentId),
    payload.intentId,
    "EX",
    INTENT_TTL_SECONDS
  );
}

async function getIntentById(intentId) {
  const raw = await redis.get(intentKey(intentId));
  if (!raw) return null;
  return JSON.parse(raw);
}

async function getIntentByProvider(provider, providerIntentId) {
  const id = await redis.get(providerIntentKey(provider, providerIntentId));
  if (!id) return null;
  return getIntentById(id);
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
  const dedupe = await redis.set(
    settledKey(intent.provider, providerPaymentId),
    "1",
    "EX",
    INTENT_TTL_SECONDS,
    "NX"
  );
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
