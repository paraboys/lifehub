import * as transactionService from "./transaction.service.js";
import { jsonSafe } from "../../common/utils/jsonSafe.js";

export async function walletSummary(req, res) {
  try {
    const summary = await transactionService.getWalletSummary(req.user.id);
    res.json(jsonSafe(summary));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function topup(req, res) {
  try {
    const payload = await transactionService.topupWalletWithMethod({
      userId: req.user.id,
      amount: req.body.amount,
      paymentMethod: req.body.paymentMethod,
      referenceId: req.body.referenceId
    });
    res.status(201).json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function paymentOptions(req, res) {
  try {
    const payload = await transactionService.getPaymentOptions({
      userId: req.user.id,
      shopId: req.query.shopId
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function list(req, res) {
  try {
    const rows = await transactionService.listTransactions({
      userId: req.user.id,
      limit: req.query.limit,
      type: req.query.type,
      status: req.query.status
    });
    res.json(jsonSafe({ transactions: rows }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function orderRefund(req, res) {
  try {
    const payload = await transactionService.issueOrderRefund({
      orderId: req.params.orderId,
      actorId: req.user.id,
      actorRoles: req.user.roles || [],
      amount: req.body.amount,
      reason: req.body.reason
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function orderPayout(req, res) {
  try {
    const payload = await transactionService.payoutOrderToShopkeeper({
      orderId: req.params.orderId,
      actorId: req.user.id,
      actorRoles: req.user.roles || []
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function reconcile(req, res) {
  try {
    const payload = await transactionService.runFinancialReconciliation();
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
