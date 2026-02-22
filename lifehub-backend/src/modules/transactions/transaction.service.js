import prisma from "../../config/db.js";
import { eventBus } from "../../common/events/eventBus.js";
import { findUserIdByUpiId, getUserSettings } from "../users/user.settings.store.js";
import { createNotification } from "../notifications/notification.service.js";
import { createExternalPayout } from "../payments/payment.gateway.js";
import { buildPhoneCandidates } from "../auth/otp.service.js";

const EPSILON = 0.0001;

function toBigInt(id) {
  return BigInt(id);
}

function toAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error("Amount must be a positive number");
  }
  return Number(num.toFixed(2));
}

function lockReason(referenceId, prefix = "ORDER_ESCROW") {
  return `${prefix}:${referenceId}`;
}

function normalizeUpiId(value) {
  return String(value || "").trim().toLowerCase();
}

async function ensureWalletTx(tx, userId) {
  const uid = toBigInt(userId);
  const found = await tx.wallets.findUnique({ where: { user_id: uid } });
  if (found) return found;
  return tx.wallets.create({
    data: {
      user_id: uid,
      balance: 0
    }
  });
}

export async function getWalletSummary(userId) {
  const uid = toBigInt(userId);
  const [wallet, locks, recentTransactions] = await Promise.all([
    prisma.wallets.findUnique({ where: { user_id: uid } }),
    prisma.wallet_locks.findMany({
      where: { user_id: uid },
      orderBy: { created_at: "desc" },
      take: 50
    }),
    prisma.transactions.findMany({
      where: {
        OR: [{ from_wallet: uid }, { to_wallet: uid }]
      },
      orderBy: { created_at: "desc" },
      take: 50
    })
  ]);

  const balance = Number(wallet?.balance || 0);
  const locked = locks.reduce((sum, lock) => sum + Number(lock.amount || 0), 0);

  return {
    wallet: wallet || null,
    availableBalance: Number((balance - locked).toFixed(2)),
    lockedBalance: Number(locked.toFixed(2)),
    locks,
    recentTransactions
  };
}

export async function topupWallet({ userId, amount, referenceId }) {
  const normalizedAmount = toAmount(amount);
  const uid = toBigInt(userId);

  const result = await prisma.$transaction(async tx => {
    await ensureWalletTx(tx, uid);
    const wallet = await tx.wallets.update({
      where: { user_id: uid },
      data: {
        balance: {
          increment: normalizedAmount
        }
      }
    });

    const transaction = await tx.transactions.create({
      data: {
        from_wallet: null,
        to_wallet: uid,
        amount: normalizedAmount,
        transaction_type: "TOPUP",
        status: "SUCCESS",
        reference_id: referenceId ? toBigInt(referenceId) : null
      }
    });

    return { wallet, transaction };
  });

  eventBus.emit("WALLET.TOPUP", {
    userId: uid,
    amount: normalizedAmount,
    transactionId: result.transaction.id
  });

  return result;
}

export async function getPaymentOptions({ userId, shopId }) {
  const uid = toBigInt(userId);
  const wallet = await prisma.wallets.findUnique({
    where: { user_id: uid }
  });

  let shop = null;
  if (shopId) {
    shop = await prisma.shop_profiles.findUnique({
      where: { id: BigInt(shopId) },
      include: {
        users: {
          select: {
            name: true,
            phone: true
          }
        }
      }
    });
  }

  const [userSettings, shopOwnerSettings] = await Promise.all([
    getUserSettings(userId),
    shop?.user_id ? getUserSettings(shop.user_id) : Promise.resolve(null)
  ]);

  const upiPayee = shop?.users?.name || "LifeHub Merchant";
  const upiVpa = shopOwnerSettings?.payments?.upiId
    || process.env.DEFAULT_MERCHANT_UPI_ID
    || (shop?.users?.phone ? `${shop.users.phone}@lifehub` : `${String(userId)}@lifehub`);
  const upiUri = `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(upiPayee)}&cu=INR`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(upiUri)}`;

  return {
    walletBalance: Number(wallet?.balance || 0),
    methods: ["WALLET", "UPI", "CARD", "QR"],
    preferredTopupMethod: userSettings?.payments?.preferredTopupMethod || "WALLET",
    upi: {
      vpa: upiVpa,
      uri: upiUri
    },
    qrCodeUrl,
    shop: shop
      ? {
          id: shop.id,
          name: shop.shop_name,
          ownerPhone: shop.users?.phone || null
        }
      : null
  };
}

export async function getWalletReceiveProfile({ userId }) {
  const uid = toBigInt(userId);
  const [user, settings] = await Promise.all([
    prisma.users.findUnique({
      where: { id: uid },
      select: { id: true, name: true, phone: true }
    }),
    getUserSettings(uid)
  ]);

  if (!user) {
    throw new Error("User not found");
  }

  const upiId = normalizeUpiId(
    settings?.payments?.upiId
    || (user.phone ? `${String(user.phone).replace(/\s+/g, "")}@lifehub` : `${String(uid)}@lifehub`)
  );
  const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(user.name || "LifeHub User")}&cu=INR`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(upiUri)}`;

  return {
    receiver: {
      id: user.id,
      name: user.name,
      phone: user.phone
    },
    upiId,
    upiUri,
    qrCodeUrl
  };
}

async function resolveP2PRecipient({ toPhone, toUpiId }) {
  if (!toPhone && !toUpiId) {
    throw new Error("Provide recipient phone or UPI ID");
  }

  if (toPhone) {
    const candidates = buildPhoneCandidates(toPhone);
    if (!candidates.length) {
      throw new Error("Recipient phone is invalid");
    }
    const user = await prisma.users.findFirst({
      where: {
        phone: { in: candidates }
      },
      select: {
        id: true,
        name: true,
        phone: true
      }
    });
    if (!user) {
      throw new Error("Recipient account not found for this phone number");
    }
    return {
      user,
      channel: "PHONE"
    };
  }

  const normalizedUpiId = normalizeUpiId(toUpiId);
  if (!normalizedUpiId) {
    throw new Error("Recipient UPI ID is required");
  }

  let mappedUserId = await findUserIdByUpiId(normalizedUpiId);
  if (!mappedUserId) {
    const localPart = normalizedUpiId.split("@")[0];
    if (/^\d{10,15}$/.test(localPart)) {
      const candidates = buildPhoneCandidates(localPart);
      const byPhone = await prisma.users.findFirst({
        where: {
          phone: { in: candidates }
        },
        select: { id: true }
      });
      mappedUserId = byPhone?.id ? String(byPhone.id) : null;
    }
  }

  if (!mappedUserId) {
    throw new Error("Recipient account not found for this UPI ID");
  }

  const user = await prisma.users.findUnique({
    where: { id: toBigInt(mappedUserId) },
    select: {
      id: true,
      name: true,
      phone: true
    }
  });
  if (!user) {
    throw new Error("Recipient account not found");
  }

  return {
    user,
    channel: "UPI"
  };
}

export async function transferWalletP2P({
  fromUserId,
  toPhone,
  toUpiId,
  amount,
  note
}) {
  const senderId = toBigInt(fromUserId);
  const normalizedAmount = toAmount(amount);
  const transferNote = String(note || "").trim();
  if (transferNote.length > 240) {
    throw new Error("Transfer note must be 240 characters or less");
  }

  const { user: recipient, channel } = await resolveP2PRecipient({
    toPhone,
    toUpiId
  });
  if (!recipient?.id) {
    throw new Error("Recipient account not found");
  }
  if (String(recipient.id) === String(senderId)) {
    throw new Error("You cannot transfer money to yourself");
  }

  const transaction = await prisma.$transaction(async tx => {
    const senderWallet = await ensureWalletTx(tx, senderId);
    await ensureWalletTx(tx, recipient.id);
    const senderBalance = Number(senderWallet.balance || 0);
    if (senderBalance + EPSILON < normalizedAmount) {
      throw new Error("Insufficient wallet balance");
    }

    await tx.wallets.update({
      where: { user_id: senderId },
      data: {
        balance: { decrement: normalizedAmount }
      }
    });

    await tx.wallets.update({
      where: { user_id: recipient.id },
      data: {
        balance: { increment: normalizedAmount }
      }
    });

    return tx.transactions.create({
      data: {
        from_wallet: senderId,
        to_wallet: recipient.id,
        amount: normalizedAmount,
        transaction_type: "P2P_TRANSFER",
        status: "SUCCESS",
        reference_id: recipient.id
      }
    });
  });

  eventBus.emit("WALLET.P2P_TRANSFER", {
    fromUserId: senderId,
    toUserId: recipient.id,
    amount: normalizedAmount,
    transactionId: transaction.id
  });

  await Promise.all([
    createNotification({
      userId: senderId,
      eventType: "WALLET.P2P_TRANSFER.SENT",
      priority: "MEDIUM",
      payload: {
        toUserId: String(recipient.id),
        amount: normalizedAmount,
        transactionId: String(transaction.id),
        channel
      },
      channels: ["IN_APP", "PUSH"]
    }),
    createNotification({
      userId: recipient.id,
      eventType: "WALLET.P2P_TRANSFER.RECEIVED",
      priority: "MEDIUM",
      payload: {
        fromUserId: String(senderId),
        amount: normalizedAmount,
        transactionId: String(transaction.id),
        channel
      },
      channels: ["IN_APP", "PUSH", "SMS"]
    })
  ]).catch(() => {});

  await prisma.analytics_events.create({
    data: {
      event_type: "WALLET.P2P_TRANSFER",
      entity_type: "TRANSACTION",
      entity_id: transaction.id,
      user_id: senderId,
      metadata: {
        toUserId: String(recipient.id),
        amount: normalizedAmount,
        note: transferNote || null,
        channel
      }
    }
  }).catch(() => {});

  return {
    transaction,
    recipient: {
      id: recipient.id,
      name: recipient.name,
      phone: recipient.phone
    },
    channel
  };
}

export async function topupWalletWithMethod({
  userId,
  amount,
  paymentMethod = "UPI",
  referenceId
}) {
  const method = String(paymentMethod || "UPI").toUpperCase();
  const allowed = new Set(["WALLET"]);
  if (!allowed.has(method)) {
    throw new Error(`Use payment intents for external method: ${method}`);
  }

  const payload = await topupWallet({
    userId,
    amount,
    referenceId
  });

  await prisma.transactions.update({
    where: { id: payload.transaction.id },
    data: {
      transaction_type: method === "WALLET" ? "TOPUP" : `TOPUP_${method}`
    }
  });

  return payload;
}

async function reserveFundsForOrderTx({ tx, userId, orderId, amount }) {
  const normalizedAmount = toAmount(amount);
  const uid = toBigInt(userId);
  const oid = toBigInt(orderId);

  const existing = await tx.transactions.findFirst({
    where: {
      transaction_type: "ESCROW_HOLD",
      reference_id: oid,
      from_wallet: uid,
      status: "SUCCESS"
    }
  });
  if (existing) return existing;

  const wallet = await ensureWalletTx(tx, uid);
  const balance = Number(wallet.balance || 0);
  if (balance + EPSILON < normalizedAmount) {
    throw new Error("Insufficient wallet balance");
  }

  await tx.wallets.update({
    where: { user_id: uid },
    data: {
      balance: {
        decrement: normalizedAmount
      }
    }
  });

  await tx.wallet_locks.create({
    data: {
      user_id: uid,
      amount: normalizedAmount,
      reason: lockReason(oid),
      created_at: new Date()
    }
  });

  const hold = await tx.transactions.create({
    data: {
      from_wallet: uid,
      to_wallet: null,
      amount: normalizedAmount,
      transaction_type: "ESCROW_HOLD",
      status: "SUCCESS",
      reference_id: oid
    }
  });

  eventBus.emit("ORDER.PAYMENT_HELD", {
    orderId: oid,
    userId: uid,
    amount: normalizedAmount,
    transactionId: hold.id
  });

  return hold;
}

export async function reserveFundsForOrder({ userId, orderId, amount, tx = null }) {
  if (tx) {
    return reserveFundsForOrderTx({ tx, userId, orderId, amount });
  }

  return prisma.$transaction(async innerTx =>
    reserveFundsForOrderTx({
      tx: innerTx,
      userId,
      orderId,
      amount
    })
  );
}

export async function releaseOrderEscrow({ orderId }) {
  const oid = toBigInt(orderId);

  return prisma.$transaction(async tx => {
    const order = await tx.orders.findUnique({
      where: { id: oid },
      include: { shop_profiles: true }
    });
    if (!order) throw new Error("Order not found");
    if (!order.user_id || !order.shop_profiles?.user_id) {
      throw new Error("Order missing payer/payee wallet linkage");
    }

    const existing = await tx.transactions.findFirst({
      where: {
        transaction_type: "ESCROW_RELEASE",
        reference_id: oid,
        status: "SUCCESS"
      }
    });
    if (existing) return existing;

    const hold = await tx.transactions.findFirst({
      where: {
        transaction_type: "ESCROW_HOLD",
        reference_id: oid,
        from_wallet: order.user_id,
        status: "SUCCESS"
      },
      orderBy: { created_at: "desc" }
    });
    if (!hold) throw new Error("No escrow hold found for order");

    await ensureWalletTx(tx, order.shop_profiles.user_id);

    await tx.wallets.update({
      where: { user_id: order.shop_profiles.user_id },
      data: {
        balance: {
          increment: Number(hold.amount || 0)
        }
      }
    });

    await tx.wallet_locks.deleteMany({
      where: {
        user_id: order.user_id,
        reason: lockReason(oid)
      }
    });

    const released = await tx.transactions.create({
      data: {
        from_wallet: order.user_id,
        to_wallet: order.shop_profiles.user_id,
        amount: hold.amount,
        transaction_type: "ESCROW_RELEASE",
        status: "SUCCESS",
        reference_id: oid
      }
    });

    eventBus.emit("ORDER.PAYMENT_RELEASED", {
      orderId: oid,
      fromWallet: order.user_id,
      toWallet: order.shop_profiles.user_id,
      amount: hold.amount,
      transactionId: released.id
    });

    return released;
  });
}

export async function refundOrderEscrow({ orderId }) {
  const oid = toBigInt(orderId);

  return prisma.$transaction(async tx => {
    const order = await tx.orders.findUnique({ where: { id: oid } });
    if (!order?.user_id) throw new Error("Order not found");

    const existing = await tx.transactions.findFirst({
      where: {
        transaction_type: "ESCROW_REFUND",
        reference_id: oid,
        status: "SUCCESS"
      }
    });
    if (existing) return existing;

    const hold = await tx.transactions.findFirst({
      where: {
        transaction_type: "ESCROW_HOLD",
        reference_id: oid,
        from_wallet: order.user_id,
        status: "SUCCESS"
      },
      orderBy: { created_at: "desc" }
    });
    if (!hold) {
      return null;
    }

    await ensureWalletTx(tx, order.user_id);
    await tx.wallets.update({
      where: { user_id: order.user_id },
      data: {
        balance: {
          increment: Number(hold.amount || 0)
        }
      }
    });

    await tx.wallet_locks.deleteMany({
      where: {
        user_id: order.user_id,
        reason: lockReason(oid)
      }
    });

    const refund = await tx.transactions.create({
      data: {
        from_wallet: null,
        to_wallet: order.user_id,
        amount: hold.amount,
        transaction_type: "ESCROW_REFUND",
        status: "SUCCESS",
        reference_id: oid
      }
    });

    eventBus.emit("ORDER.PAYMENT_REFUNDED", {
      orderId: oid,
      toWallet: order.user_id,
      amount: hold.amount,
      transactionId: refund.id
    });

    return refund;
  });
}

export async function listTransactions({ userId, limit = 50, type, status }) {
  const uid = toBigInt(userId);
  return prisma.transactions.findMany({
    where: {
      OR: [{ from_wallet: uid }, { to_wallet: uid }],
      ...(type ? { transaction_type: String(type).toUpperCase() } : {}),
      ...(status ? { status: String(status).toUpperCase() } : {})
    },
    orderBy: { created_at: "desc" },
    take: Math.min(Math.max(Number(limit) || 50, 1), 200)
  });
}

async function getOrderWithActors(orderId) {
  const order = await prisma.orders.findUnique({
    where: { id: toBigInt(orderId) },
    include: {
      users: {
        select: { id: true, name: true, phone: true }
      },
      shop_profiles: {
        include: {
          users: {
            select: { id: true, name: true, phone: true }
          }
        }
      }
    }
  });
  if (!order || !order.user_id || !order.shop_profiles?.user_id) {
    throw new Error("Order or wallet actors not found");
  }
  return order;
}

function canManageOrderMoney({ order, actorId, roles = [] }) {
  const normalized = roles.map(role => String(role).toUpperCase());
  const isAdmin = normalized.includes("ADMIN") || normalized.includes("BUSINESS");
  const isCustomer = String(order.user_id) === String(actorId);
  const isShopkeeper = normalized.includes("SHOPKEEPER")
    && String(order.shop_profiles?.user_id) === String(actorId);
  return isAdmin || isCustomer || isShopkeeper;
}

export async function issueOrderRefund({
  orderId,
  actorId,
  actorRoles = [],
  amount,
  reason
}) {
  const order = await getOrderWithActors(orderId);
  if (!canManageOrderMoney({ order, actorId, roles: actorRoles })) {
    throw new Error("Access denied for refund");
  }

  const normalizedAmount = amount === undefined || amount === null
    ? Number(order.total || 0)
    : toAmount(amount);
  if (normalizedAmount <= 0) throw new Error("Refund amount must be positive");

  const existing = await prisma.transactions.findFirst({
    where: {
      reference_id: order.id,
      transaction_type: "CUSTOMER_REFUND",
      status: "SUCCESS"
    },
    orderBy: { created_at: "desc" }
  });
  if (existing) return existing;

  const released = await prisma.transactions.findFirst({
    where: {
      reference_id: order.id,
      transaction_type: "ESCROW_RELEASE",
      status: "SUCCESS"
    },
    orderBy: { created_at: "desc" }
  });

  if (!released) {
    const escrowRefund = await refundOrderEscrow({ orderId: order.id });
    if (escrowRefund) return escrowRefund;
  }

  const customerId = order.user_id;
  const shopkeeperId = order.shop_profiles.user_id;

  const refundTx = await prisma.$transaction(async tx => {
    await ensureWalletTx(tx, customerId);
    const shopWallet = await ensureWalletTx(tx, shopkeeperId);

    const available = Number(shopWallet.balance || 0);
    if (available + EPSILON < normalizedAmount) {
      throw new Error("Shopkeeper wallet has insufficient balance for refund");
    }

    await tx.wallets.update({
      where: { user_id: shopkeeperId },
      data: { balance: { decrement: normalizedAmount } }
    });
    await tx.wallets.update({
      where: { user_id: customerId },
      data: { balance: { increment: normalizedAmount } }
    });

    return tx.transactions.create({
      data: {
        from_wallet: shopkeeperId,
        to_wallet: customerId,
        amount: normalizedAmount,
        transaction_type: "CUSTOMER_REFUND",
        status: "SUCCESS",
        reference_id: order.id
      }
    });
  });

  eventBus.emit("ORDER.REFUND_ISSUED", {
    orderId: order.id,
    actorId,
    amount: normalizedAmount,
    reason: reason || "CUSTOMER_REQUESTED",
    transactionId: refundTx.id
  });

  await prisma.analytics_events.create({
    data: {
      event_type: "ORDER.REFUND_ISSUED",
      entity_type: "ORDER",
      entity_id: order.id,
      user_id: toBigInt(actorId),
      metadata: {
        amount: normalizedAmount,
        reason: reason || "CUSTOMER_REQUESTED"
      }
    }
  });

  await createNotification({
    userId: customerId,
    eventType: "ORDER.REFUND_ISSUED",
    priority: "HIGH",
    payload: {
      orderId: String(order.id),
      amount: normalizedAmount
    },
    channels: ["IN_APP", "PUSH", "SMS"]
  });

  return refundTx;
}

export async function payoutOrderToShopkeeper({
  orderId,
  actorId,
  actorRoles = []
}) {
  const order = await getOrderWithActors(orderId);
  const normalized = actorRoles.map(role => String(role).toUpperCase());
  const isAdmin = normalized.includes("ADMIN") || normalized.includes("BUSINESS");
  const isShopkeeper = normalized.includes("SHOPKEEPER")
    && String(order.shop_profiles?.user_id) === String(actorId);
  if (!isAdmin && !isShopkeeper) {
    throw new Error("Access denied for payout");
  }

  const status = String(order.status || "").toUpperCase();
  if (!["DELIVERED", "COMPLETED"].includes(status)) {
    throw new Error("Payout is allowed only after delivery/completion");
  }

  const existing = await prisma.transactions.findFirst({
    where: {
      reference_id: order.id,
      transaction_type: "SHOP_PAYOUT",
      status: "SUCCESS"
    },
    orderBy: { created_at: "desc" }
  });
  if (existing) return existing;

  const amount = Number(order.total || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid order amount");
  }

  const shopkeeperId = order.shop_profiles.user_id;
  const customerId = order.user_id;

  await prisma.$transaction(async tx => {
    await ensureWalletTx(tx, shopkeeperId);
    await ensureWalletTx(tx, customerId);
  });

  const payoutSettings = await getUserSettings(shopkeeperId);
  const upiId = payoutSettings?.payments?.upiId || "";
  if (!upiId) {
    throw new Error("Shopkeeper UPI ID is not configured");
  }

  const wallet = await prisma.wallets.findUnique({
    where: { user_id: shopkeeperId }
  });
  if (Number(wallet?.balance || 0) + EPSILON < amount) {
    throw new Error("Insufficient shopkeeper wallet balance for payout");
  }

  const pending = await prisma.transactions.create({
    data: {
      from_wallet: shopkeeperId,
      to_wallet: null,
      amount,
      transaction_type: "SHOP_PAYOUT",
      status: "PENDING",
      reference_id: order.id
    }
  });

  try {
    const external = await createExternalPayout({
      amount,
      beneficiaryName: order.shop_profiles.users?.name || "LifeHub Shopkeeper",
      beneficiaryPhone: order.shop_profiles.users?.phone || "",
      beneficiaryUpiId: upiId,
      referenceId: `order_${String(order.id)}_${String(pending.id)}`
    });

    await prisma.$transaction(async tx => {
      await tx.wallets.update({
        where: { user_id: shopkeeperId },
        data: {
          balance: {
            decrement: amount
          }
        }
      });
      await tx.transactions.update({
        where: { id: pending.id },
        data: { status: "SUCCESS" }
      });
    });

    await prisma.analytics_events.create({
      data: {
        event_type: "SHOP.PAYOUT_EXECUTED",
        entity_type: "ORDER",
        entity_id: order.id,
        user_id: toBigInt(actorId),
        metadata: {
          payoutProvider: external.provider,
          payoutId: external.payoutId,
          amount
        }
      }
    });

    eventBus.emit("SHOP.PAYOUT_EXECUTED", {
      orderId: order.id,
      shopkeeperId,
      amount,
      transactionId: pending.id,
      payoutId: external.payoutId
    });

    await createNotification({
      userId: shopkeeperId,
      eventType: "SHOP.PAYOUT_EXECUTED",
      priority: "HIGH",
      payload: {
        orderId: String(order.id),
        amount
      },
      channels: ["IN_APP", "PUSH", "SMS"]
    });

    return prisma.transactions.findUnique({ where: { id: pending.id } });
  } catch (error) {
    await prisma.transactions.update({
      where: { id: pending.id },
      data: { status: "FAILED" }
    });

    throw error;
  }
}

export async function runFinancialReconciliation() {
  const mismatches = [];
  const orders = await prisma.orders.findMany({
    take: 500
  });

  for (const order of orders) {
    const status = String(order.status || "").toUpperCase();
    const txs = await prisma.transactions.findMany({
      where: {
        reference_id: order.id
      }
    });

    const hasHold = txs.some(tx => tx.transaction_type === "ESCROW_HOLD" && tx.status === "SUCCESS");
    const hasRelease = txs.some(tx => tx.transaction_type === "ESCROW_RELEASE" && tx.status === "SUCCESS");
    const hasRefund = txs.some(tx => ["ESCROW_REFUND", "CUSTOMER_REFUND"].includes(String(tx.transaction_type)) && tx.status === "SUCCESS");

    if (status === "CREATED" && !hasHold) {
      mismatches.push({
        orderId: String(order.id),
        issue: "MISSING_ESCROW_HOLD"
      });
    }
    if (["DELIVERED", "COMPLETED"].includes(status) && !hasRelease) {
      mismatches.push({
        orderId: String(order.id),
        issue: "MISSING_ESCROW_RELEASE"
      });
    }
    if ((status.includes("CANCEL") || status.includes("FAIL")) && !hasRefund) {
      mismatches.push({
        orderId: String(order.id),
        issue: "MISSING_REFUND"
      });
    }
  }

  for (const row of mismatches) {
    await prisma.analytics_events.create({
      data: {
        event_type: "RECONCILIATION.MISMATCH",
        entity_type: "ORDER",
        entity_id: toBigInt(row.orderId),
        metadata: row
      }
    });
  }

  eventBus.emit("FINANCE.RECONCILIATION_COMPLETED", {
    checkedOrders: orders.length,
    mismatchCount: mismatches.length
  });

  return {
    checkedOrders: orders.length,
    mismatchCount: mismatches.length,
    mismatches
  };
}
