import * as orderService from "./order.service.js";
import { jsonSafe } from "../../common/utils/jsonSafe.js";

export async function createOrder(req, res) {
  try {
    const idempotencyKey = req.headers["x-idempotency-key"];
    const payload = await orderService.createOrder({
      userId: req.user.id,
      shopId: req.body.shopId,
      total: req.body.total,
      items: req.body.items || [],
      deliveryDetails: req.body.deliveryDetails || {},
      idempotencyKey
    });
    res.status(201).json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function listOrders(req, res) {
  try {
    const orders = await orderService.listOrders({
      userId: req.user.id,
      roles: req.user.roles || [],
      limit: req.query.limit,
      status: req.query.status
    });
    res.json(jsonSafe({ orders }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getOrder(req, res) {
  try {
    const order = await orderService.getOrderById({
      orderId: req.params.orderId,
      userId: req.user.id,
      roles: req.user.roles || []
    });
    res.json(jsonSafe(order));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
}

export async function cancelOrder(req, res) {
  try {
    const updated = await orderService.cancelOrder({
      orderId: req.params.orderId,
      userId: req.user.id,
      reason: req.body.reason
    });
    res.json(jsonSafe(updated));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function startDelivery(req, res) {
  try {
    const payload = await orderService.startOrderDelivery({
      orderId: req.params.orderId,
      actorId: req.user.id,
      actorRoles: req.user.roles || []
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function issueDeliveryOtp(req, res) {
  try {
    const payload = await orderService.issueDeliveryOtp({
      orderId: req.params.orderId,
      actorId: req.user.id,
      actorRoles: req.user.roles || []
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function confirmDelivery(req, res) {
  try {
    const payload = await orderService.confirmDelivery({
      orderId: req.params.orderId,
      actorId: req.user.id,
      actorRoles: req.user.roles || [],
      otp: req.body.otp,
      rating: req.body.rating,
      feedback: req.body.feedback
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
