import os

filepath = r"c:\Users\Paras BUBU\OneDrive\Desktop\final-year-project\lifehub-backend\src\modules\payments\payment.service.js"

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add Imports
text = text.replace(
    'import { topupWallet } from "../transactions/transaction.service.js";',
    'import { topupWallet, reserveFundsForOrder } from "../transactions/transaction.service.js";\nimport prisma from "../../config/db.js";'
)

# 2. Update settleIntent
old_settle = r'''  if (intent.status !== "SUCCEEDED" && intent.purpose === "TOPUP") {
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
  }'''

new_settle = r'''  if (intent.status !== "SUCCEEDED") {
    if (intent.purpose === "TOPUP") {
      await topupWallet({
        userId: intent.userId,
        amount: intent.amount,
        referenceId: undefined
      });
    } else if (intent.purpose === "ORDER") {
      // 1. Credit wallet temporarily with gateway funds
      await topupWallet({
        userId: intent.userId,
        amount: intent.amount,
        referenceId: undefined
      });
      // 2. Lock it in escrow to pay the shopkeeper
      await reserveFundsForOrder({
        userId: intent.userId,
        orderId: intent.metadata.orderId,
        amount: intent.amount
      });
      // 3. Mark the order as paid properly
      await prisma.orders.update({
        where: { id: BigInt(intent.metadata.orderId) },
        data: { payment_status: 'PAID' }
      });
    }

    eventBus.emit("PAYMENT.INTENT_SETTLED", {
      intentId: intent.intentId,
      provider: intent.provider,
      userId: intent.userId,
      amount: intent.amount,
      purpose: intent.purpose
    });
  }'''
text = text.replace(old_settle, new_settle)

# 3. Update createPaymentIntent restriction
old_restrict = r'''  if (normalizedPurpose !== "TOPUP") {
    throw new Error("Only TOPUP purpose is supported in current gateway flow");
  }'''

new_restrict = r'''  if (normalizedPurpose !== "TOPUP" && normalizedPurpose !== "ORDER") {
    throw new Error("Only TOPUP and ORDER purposes are supported");
  }'''
text = text.replace(old_restrict, new_restrict)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print("payment.service.js patched successfully for ORDER routing.")
