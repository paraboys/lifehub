import crypto from "crypto";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function formUrlEncode(data) {
  return new URLSearchParams(
    Object.entries(data).reduce((acc, [key, value]) => {
      if (value === undefined || value === null) return acc;
      acc[key] = String(value);
      return acc;
    }, {})
  ).toString();
}

export async function createGatewayIntent({
  provider,
  intentId,
  amount,
  currency = "INR",
  metadata = {}
}) {
  if (provider === "RAZORPAY") {
    const keyId = requireEnv("RAZORPAY_KEY_ID");
    const keySecret = requireEnv("RAZORPAY_KEY_SECRET");
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: Math.round(Number(amount) * 100),
        currency,
        receipt: intentId,
        notes: metadata
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.description || "Razorpay order creation failed");

    return {
      providerIntentId: data.id,
      checkout: {
        provider: "RAZORPAY",
        keyId,
        orderId: data.id,
        amount: Number(amount),
        currency,
        receipt: intentId
      }
    };
  }

  if (provider === "STRIPE") {
    const secret = requireEnv("STRIPE_SECRET_KEY");
    const body = formUrlEncode({
      amount: Math.round(Number(amount) * 100),
      currency: String(currency || "INR").toLowerCase(),
      "metadata[intent_id]": intentId,
      automatic_payment_methods: "enabled"
    });

    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || "Stripe intent creation failed");

    return {
      providerIntentId: data.id,
      checkout: {
        provider: "STRIPE",
        paymentIntentId: data.id,
        clientSecret: data.client_secret,
        amount: Number(amount),
        currency
      }
    };
  }

  throw new Error(`Unsupported payment provider: ${provider}`);
}

export function verifyWebhookSignature({ provider, rawBody, headers }) {
  if (provider === "RAZORPAY") {
    const secret = requireEnv("RAZORPAY_WEBHOOK_SECRET");
    const signature = headers["x-razorpay-signature"];
    if (!signature) return false;
    const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(String(signature)));
  }

  if (provider === "STRIPE") {
    const secret = requireEnv("STRIPE_WEBHOOK_SECRET");
    const signatureHeader = headers["stripe-signature"];
    if (!signatureHeader) return false;

    const parts = String(signatureHeader).split(",").reduce((acc, part) => {
      const [k, v] = part.split("=");
      acc[k] = v;
      return acc;
    }, {});
    if (!parts.t || !parts.v1) return false;

    const payload = `${parts.t}.${rawBody}`;
    const digest = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(parts.v1));
  }

  return false;
}

export function verifyPaymentSignature({
  provider,
  providerIntentId,
  providerPaymentId,
  signature
}) {
  if (provider === "RAZORPAY") {
    const secret = requireEnv("RAZORPAY_KEY_SECRET");
    if (!providerIntentId || !providerPaymentId || !signature) return false;
    const payload = `${providerIntentId}|${providerPaymentId}`;
    const digest = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(String(signature)));
  }

  if (provider === "STRIPE") {
    // Stripe payment confirmation should be trusted via webhook.
    return false;
  }

  return false;
}

export function parseWebhookEvent({ provider, body }) {
  if (provider === "RAZORPAY") {
    const event = body?.event;
    if (event !== "payment.captured" && event !== "order.paid") return null;
    const payment = body?.payload?.payment?.entity;
    const order = body?.payload?.order?.entity;
    return {
      provider: "RAZORPAY",
      providerIntentId: payment?.order_id || order?.id || null,
      providerPaymentId: payment?.id || null,
      status: "SUCCEEDED"
    };
  }

  if (provider === "STRIPE") {
    const event = body?.type;
    if (event !== "payment_intent.succeeded") return null;
    const intent = body?.data?.object;
    return {
      provider: "STRIPE",
      providerIntentId: intent?.id || null,
      providerPaymentId: intent?.latest_charge || intent?.id || null,
      status: "SUCCEEDED"
    };
  }

  return null;
}

export async function createExternalPayout({
  amount,
  currency = "INR",
  beneficiaryName,
  beneficiaryPhone,
  beneficiaryUpiId,
  referenceId
}) {
  const keyId = requireEnv("RAZORPAYX_KEY_ID");
  const keySecret = requireEnv("RAZORPAYX_KEY_SECRET");
  const accountNumber = requireEnv("RAZORPAYX_ACCOUNT_NUMBER");

  if (!beneficiaryUpiId) {
    throw new Error("Beneficiary UPI ID is missing");
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const payload = {
    account_number: accountNumber,
    amount: Math.round(Number(amount) * 100),
    currency: String(currency || "INR").toUpperCase(),
    mode: "UPI",
    purpose: "payout",
    queue_if_low_balance: true,
    reference_id: String(referenceId),
    narration: "LifeHub shopkeeper payout",
    fund_account: {
      account_type: "vpa",
      vpa: {
        address: beneficiaryUpiId
      },
      contact: {
        name: beneficiaryName || "LifeHub Shopkeeper",
        type: "vendor",
        contact: beneficiaryPhone || "9000000000",
        reference_id: `contact_${String(referenceId)}`
      }
    }
  };

  const res = await fetch("https://api.razorpay.com/v1/payouts", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.description || "RazorpayX payout failed");
  }

  return {
    provider: "RAZORPAYX",
    payoutId: data.id,
    status: data.status || "queued",
    raw: data
  };
}
