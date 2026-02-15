import * as paymentService from "./payment.service.js";
import { jsonSafe } from "../../common/utils/jsonSafe.js";

export async function createIntent(req, res) {
  try {
    const payload = await paymentService.createPaymentIntent({
      userId: req.user.id,
      amount: req.body.amount,
      purpose: req.body.purpose,
      provider: req.body.provider,
      paymentMethod: req.body.paymentMethod,
      currency: req.body.currency,
      metadata: req.body.metadata || {}
    });
    res.status(201).json(jsonSafe(payload));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function getIntent(req, res) {
  try {
    const payload = await paymentService.getPaymentIntent(req.params.intentId);
    if (!payload || String(payload.userId) !== String(req.user.id)) {
      return res.status(404).json({ error: "Payment intent not found" });
    }
    res.json(jsonSafe(payload));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function confirmIntent(req, res) {
  try {
    const payload = await paymentService.confirmPaymentIntent({
      intentId: req.params.intentId,
      userId: req.user.id,
      providerIntentId: req.body.providerIntentId,
      providerPaymentId: req.body.providerPaymentId,
      signature: req.body.signature
    });
    res.json(jsonSafe(payload));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

export async function webhook(req, res) {
  try {
    const payload = await paymentService.processWebhook({
      provider: req.params.provider,
      rawBody: req.rawBody || JSON.stringify(req.body || {}),
      body: req.body,
      headers: req.headers
    });
    res.json(jsonSafe({ ok: true, ...payload }));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
