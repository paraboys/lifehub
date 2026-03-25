import prisma from "../../config/db.js";
import { emitToUser } from "../../common/realtime/socketHub.js";
import { eventBus } from "../../common/events/eventBus.js";
import { normalizeBigInt } from "../../common/utils/bigint.js";
import { replayOfflineEvents } from "../../common/realtime/offlineEvents.js";
import { createNotification } from "../notifications/notification.service.js";
import { getSharedRedisClient } from "../../config/redis.js";
import { buildPhoneCandidates } from "../auth/otp.service.js";

const redis = getSharedRedisClient();
const MAX_MESSAGES_PER_MIN = Number(process.env.CHAT_RATE_LIMIT_PER_MIN || 30);
const BLOCKED_WORDS = (process.env.CHAT_BLOCKED_WORDS || "abuse,scam,fraud")
  .split(",")
  .map(v => v.trim().toLowerCase())
  .filter(Boolean);
const CONTACT_TABLE = "chat_contacts";
const CONTACT_PENDING = "PENDING";
const CONTACT_ACCEPTED = "ACCEPTED";
const CONTACT_REJECTED = "REJECTED";
let chatContactsEnsured = false;

async function getParticipantIds(conversationId) {
  const participants = await prisma.conversation_participants.findMany({
    where: { conversation_id: BigInt(conversationId) },
    select: { user_id: true }
  });
  return participants.map(p => String(p.user_id));
}

async function ensureChatContactsTable() {
  if (chatContactsEnsured) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${CONTACT_TABLE}" (
      "id" BIGSERIAL PRIMARY KEY,
      "requester_user_id" BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "addressee_user_id" BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "status" VARCHAR(16) NOT NULL DEFAULT '${CONTACT_PENDING}',
      "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "responded_at" TIMESTAMP(6),
      CONSTRAINT "chat_contacts_no_self_request" CHECK ("requester_user_id" <> "addressee_user_id"),
      CONSTRAINT "chat_contacts_status_check" CHECK ("status" IN ('${CONTACT_PENDING}','${CONTACT_ACCEPTED}','${CONTACT_REJECTED}'))
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "chat_contacts_requester_addressee_key"
    ON "${CONTACT_TABLE}" ("requester_user_id", "addressee_user_id")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "chat_contacts_addressee_status_idx"
    ON "${CONTACT_TABLE}" ("addressee_user_id", "status", "created_at" DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "chat_contacts_requester_status_idx"
    ON "${CONTACT_TABLE}" ("requester_user_id", "status", "created_at" DESC)
  `);

  chatContactsEnsured = true;
}

function normalizePhone(phone) {
  return String(phone || "").trim();
}

function buildNormalizedPhoneCandidates(phone) {
  return [...new Set(buildPhoneCandidates(phone).map(normalizePhone).filter(Boolean))];
}

function buildPhoneCandidatePool(phones = []) {
  const seen = new Set();
  const values = [];

  for (const phone of phones) {
    for (const candidate of buildNormalizedPhoneCandidates(phone)) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      values.push(candidate);
    }
  }

  return values;
}

async function findUserByPhone(phone, select = { id: true, name: true, phone: true }) {
  const candidates = buildNormalizedPhoneCandidates(phone);
  if (!candidates.length) return null;

  return prisma.users.findFirst({
    where: {
      phone: { in: candidates }
    },
    select
  });
}

function cdnUrlFromStorage(storagePath) {
  const base = process.env.MEDIA_CDN_BASE_URL || "http://localhost:4000/cdn";
  return `${base}/${storagePath}`;
}

async function assertParticipant(conversationId, userId) {
  const member = await prisma.conversation_participants.findUnique({
    where: {
      conversation_id_user_id: {
        conversation_id: BigInt(conversationId),
        user_id: BigInt(userId)
      }
    }
  });
  if (!member) throw new Error("Not a conversation participant");
}

async function assertNotSpam(userId) {
  try {
    const key = `chat:rate:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 60);
    }
    if (count > MAX_MESSAGES_PER_MIN) {
      throw new Error("Too many messages. Please slow down.");
    }
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("wrongpass") || message.includes("stream isn't writeable")) {
      return;
    }
    throw error;
  }
}

function assertModerationSafe(content) {
  const text = String(content || "").toLowerCase();
  if (!text) return;
  for (const blocked of BLOCKED_WORDS) {
    if (blocked && text.includes(blocked)) {
      throw new Error("Message blocked by moderation policy");
    }
  }
}

function assertEncryptedPayload(payload) {
  const required = ["ciphertext", "iv", "alg", "keyId"];
  for (const key of required) {
    if (!payload?.[key]) {
      throw new Error(`Missing encrypted payload field: ${key}`);
    }
  }
}

export async function createConversation({ creatorId, participantIds = [], type = "DIRECT" }) {
  const ids = [...new Set([String(creatorId), ...participantIds.map(String)])];
  if (ids.length < 2) throw new Error("At least 2 participants required");

  const conversation = await prisma.conversations.create({
    data: {
      type,
      created_by: BigInt(creatorId)
    }
  });

  await prisma.conversation_participants.createMany({
    data: ids.map(id => ({
      conversation_id: conversation.id,
      user_id: BigInt(id)
    }))
  });

  const payload = normalizeBigInt(conversation);
  for (const id of ids) {
    emitToUser(id, "chat:conversation.created", payload);
  }

  return conversation;
}

async function getExistingDirectConversation(creatorId, peerId) {
  const candidateConversations = await prisma.conversations.findMany({
    where: {
      type: "DIRECT",
      conversation_participants: {
        some: { user_id: BigInt(creatorId) }
      },
      AND: [
        {
          conversation_participants: {
            some: { user_id: BigInt(peerId) }
          }
        }
      ]
    },
    include: {
      conversation_participants: {
        select: { user_id: true }
      }
    },
    orderBy: { created_at: "desc" },
    take: 20
  });

  return candidateConversations.find(item => {
    const participants = item.conversation_participants || [];
    if (participants.length !== 2) return false;
    const ids = participants.map(p => String(p.user_id));
    return ids.includes(String(creatorId)) && ids.includes(String(peerId));
  }) || null;
}

async function getOrCreateDirectConversationBetweenUsers(creatorId, peerId) {
  const existing = await getExistingDirectConversation(creatorId, peerId);
  if (existing) return existing;

  return createConversation({
    creatorId,
    participantIds: [String(peerId)],
    type: "DIRECT"
  });
}

async function getContactRecord(userId, peerId) {
  await ensureChatContactsTable();
  const uid = String(BigInt(userId));
  const pid = String(BigInt(peerId));
  const rows = await prisma.$queryRawUnsafe(`
    SELECT *
    FROM "${CONTACT_TABLE}"
    WHERE ("requester_user_id" = ${uid} AND "addressee_user_id" = ${pid})
       OR ("requester_user_id" = ${pid} AND "addressee_user_id" = ${uid})
    ORDER BY
      CASE
        WHEN "status" = '${CONTACT_ACCEPTED}' THEN 0
        WHEN "status" = '${CONTACT_PENDING}' THEN 1
        ELSE 2
      END,
      "created_at" DESC
    LIMIT 1
  `);

  return rows?.[0] || null;
}

async function getContactStatus(userId, peerId) {
  const row = await getContactRecord(userId, peerId);
  if (!row) return "NONE";
  if (String(row.status || "").toUpperCase() === CONTACT_ACCEPTED) return CONTACT_ACCEPTED;
  if (String(row.status || "").toUpperCase() === CONTACT_REJECTED) return CONTACT_REJECTED;
  if (String(row.requester_user_id) === String(userId)) return "OUTGOING_PENDING";
  return "INCOMING_PENDING";
}

async function ensureAcceptedContact(userId, peerId) {
  await ensureChatContactsTable();
  const uid = String(BigInt(userId));
  const pid = String(BigInt(peerId));
  const existing = await getContactRecord(uid, pid);

  if (existing && String(existing.status || "").toUpperCase() === CONTACT_ACCEPTED) {
    return existing;
  }

  if (existing) {
    await prisma.$executeRawUnsafe(`
      UPDATE "${CONTACT_TABLE}"
      SET "status" = '${CONTACT_ACCEPTED}',
          "responded_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${String(existing.id)}
    `);
  } else {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "${CONTACT_TABLE}" ("requester_user_id", "addressee_user_id", "status", "responded_at")
      VALUES (${uid}, ${pid}, '${CONTACT_ACCEPTED}', CURRENT_TIMESTAMP)
    `);
  }

  return getContactRecord(uid, pid);
}

async function getAcceptedContactUserIds(userId) {
  await ensureChatContactsTable();
  const uid = String(BigInt(userId));
  const rows = await prisma.$queryRawUnsafe(`
    SELECT CASE
      WHEN "requester_user_id" = ${uid} THEN "addressee_user_id"
      ELSE "requester_user_id"
    END AS "contact_user_id"
    FROM "${CONTACT_TABLE}"
    WHERE ("requester_user_id" = ${uid} OR "addressee_user_id" = ${uid})
      AND "status" = '${CONTACT_ACCEPTED}'
  `);

  return new Set((rows || []).map(row => String(row.contact_user_id)));
}

function mapContactDirectoryRow(row) {
  return {
    id: row.id,
    requestId: row.id,
    userId: row.contactUserId || row.peerUserId,
    name: row.name || "Unknown",
    phone: row.phone || null,
    status: row.status,
    createdAt: row.createdAt || row.created_at,
    respondedAt: row.respondedAt || row.responded_at
  };
}

export async function listContactDirectory(userId) {
  await ensureChatContactsTable();
  const uid = String(BigInt(userId));

  const [contacts, incoming, outgoing] = await Promise.all([
    prisma.$queryRawUnsafe(`
      SELECT
        cc."id",
        cc."status",
        cc."created_at" AS "createdAt",
        cc."responded_at" AS "respondedAt",
        CASE WHEN cc."requester_user_id" = ${uid} THEN cc."addressee_user_id" ELSE cc."requester_user_id" END AS "contactUserId",
        u."name",
        u."phone"
      FROM "${CONTACT_TABLE}" cc
      JOIN "users" u
        ON u."id" = CASE WHEN cc."requester_user_id" = ${uid} THEN cc."addressee_user_id" ELSE cc."requester_user_id" END
      WHERE (cc."requester_user_id" = ${uid} OR cc."addressee_user_id" = ${uid})
        AND cc."status" = '${CONTACT_ACCEPTED}'
      ORDER BY COALESCE(cc."responded_at", cc."created_at") DESC
    `),
    prisma.$queryRawUnsafe(`
      SELECT
        cc."id",
        cc."status",
        cc."created_at" AS "createdAt",
        cc."requester_user_id" AS "peerUserId",
        u."name",
        u."phone"
      FROM "${CONTACT_TABLE}" cc
      JOIN "users" u ON u."id" = cc."requester_user_id"
      WHERE cc."addressee_user_id" = ${uid}
        AND cc."status" = '${CONTACT_PENDING}'
      ORDER BY cc."created_at" DESC
    `),
    prisma.$queryRawUnsafe(`
      SELECT
        cc."id",
        cc."status",
        cc."created_at" AS "createdAt",
        cc."addressee_user_id" AS "peerUserId",
        u."name",
        u."phone"
      FROM "${CONTACT_TABLE}" cc
      JOIN "users" u ON u."id" = cc."addressee_user_id"
      WHERE cc."requester_user_id" = ${uid}
        AND cc."status" = '${CONTACT_PENDING}'
      ORDER BY cc."created_at" DESC
    `)
  ]);

  return {
    contacts: (contacts || []).map(mapContactDirectoryRow),
    incomingRequests: (incoming || []).map(mapContactDirectoryRow),
    outgoingRequests: (outgoing || []).map(mapContactDirectoryRow)
  };
}

export async function requestContactByPhone({ requesterId, phone }) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new Error("phone is required");
  }

  const peer = await findUserByPhone(normalizedPhone);
  if (!peer) {
    throw new Error("No LifeHub account found for this phone number");
  }
  if (String(peer.id) === String(requesterId)) {
    throw new Error("Cannot add yourself as a contact");
  }

  await ensureChatContactsTable();
  const existing = await getContactRecord(requesterId, peer.id);
  if (existing && String(existing.status || "").toUpperCase() === CONTACT_ACCEPTED) {
    const conversation = await getOrCreateDirectConversationBetweenUsers(requesterId, peer.id);
    return {
      status: CONTACT_ACCEPTED,
      requestId: String(existing.id),
      contact: peer,
      conversationId: String(conversation.id)
    };
  }

  if (
    existing
    && String(existing.status || "").toUpperCase() === CONTACT_PENDING
    && String(existing.requester_user_id) === String(peer.id)
  ) {
    await prisma.$executeRawUnsafe(`
      UPDATE "${CONTACT_TABLE}"
      SET "status" = '${CONTACT_ACCEPTED}',
          "responded_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${String(existing.id)}
    `);
    const conversation = await getOrCreateDirectConversationBetweenUsers(requesterId, peer.id);
    await createNotification({
      userId: String(peer.id),
      eventType: "CHAT.CONTACT_ACCEPTED",
      priority: "MEDIUM",
      payload: {
        userId: String(requesterId),
        conversationId: String(conversation.id)
      },
      channels: ["IN_APP", "PUSH"]
    }).catch(() => {});
    return {
      status: CONTACT_ACCEPTED,
      requestId: String(existing.id),
      contact: peer,
      conversationId: String(conversation.id)
    };
  }

  if (
    existing
    && String(existing.status || "").toUpperCase() === CONTACT_PENDING
    && String(existing.requester_user_id) === String(requesterId)
  ) {
    return {
      status: CONTACT_PENDING,
      requestId: String(existing.id),
      contact: peer
    };
  }

  await prisma.$executeRawUnsafe(`
    INSERT INTO "${CONTACT_TABLE}" ("requester_user_id", "addressee_user_id", "status")
    VALUES (${String(BigInt(requesterId))}, ${String(BigInt(peer.id))}, '${CONTACT_PENDING}')
  `);
  const created = await getContactRecord(requesterId, peer.id);

  await createNotification({
    userId: String(peer.id),
    eventType: "CHAT.CONTACT_REQUEST",
    priority: "MEDIUM",
    payload: {
      requesterId: String(requesterId),
      requesterPhone: normalizedPhone
    },
    channels: ["IN_APP", "PUSH"]
  }).catch(() => {});

  return {
    status: CONTACT_PENDING,
    requestId: String(created?.id || ""),
    contact: peer
  };
}

export async function respondToContactRequest({ requestId, userId, action }) {
  await ensureChatContactsTable();
  const responseAction = String(action || "").trim().toUpperCase();
  if (!["ACCEPT", "REJECT"].includes(responseAction)) {
    throw new Error("action must be ACCEPT or REJECT");
  }

  const rows = await prisma.$queryRawUnsafe(`
    SELECT cc.*, u."name", u."phone"
    FROM "${CONTACT_TABLE}" cc
    JOIN "users" u ON u."id" = cc."requester_user_id"
    WHERE cc."id" = ${String(BigInt(requestId))}
      AND cc."addressee_user_id" = ${String(BigInt(userId))}
    LIMIT 1
  `);
  const request = rows?.[0];
  if (!request) {
    throw new Error("Contact request not found");
  }
  if (String(request.status || "").toUpperCase() !== CONTACT_PENDING) {
    throw new Error(`Contact request already ${String(request.status || "").toLowerCase()}`);
  }

  const nextStatus = responseAction === "ACCEPT" ? CONTACT_ACCEPTED : CONTACT_REJECTED;
  await prisma.$executeRawUnsafe(`
    UPDATE "${CONTACT_TABLE}"
    SET "status" = '${nextStatus}',
        "responded_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${String(request.id)}
  `);

  let conversationId = null;
  if (nextStatus === CONTACT_ACCEPTED) {
    await ensureAcceptedContact(userId, request.requester_user_id);
    const conversation = await getOrCreateDirectConversationBetweenUsers(userId, request.requester_user_id);
    conversationId = String(conversation.id);
  }

  await createNotification({
    userId: String(request.requester_user_id),
    eventType: nextStatus === CONTACT_ACCEPTED ? "CHAT.CONTACT_ACCEPTED" : "CHAT.CONTACT_REJECTED",
    priority: "MEDIUM",
    payload: {
      requestId: String(request.id),
      conversationId
    },
    channels: ["IN_APP", "PUSH"]
  }).catch(() => {});

  return {
    requestId: String(request.id),
    status: nextStatus,
    conversationId,
    contact: {
      id: request.requester_user_id,
      name: request.name,
      phone: request.phone
    }
  };
}

export async function listConversations(userId) {
  const acceptedContactIds = await getAcceptedContactUserIds(userId);
  const memberships = await prisma.conversation_participants.findMany({
    where: { user_id: BigInt(userId) },
    include: {
      conversations: {
        include: {
          conversation_participants: {
            include: {
              users: {
                select: {
                  id: true,
                  name: true,
                  phone: true
                }
              }
            }
          },
          messages: {
            orderBy: { created_at: "desc" },
            take: 1
          }
        }
      }
    },
    orderBy: {
      joined_at: "desc"
    }
  });

  const rows = await Promise.all(memberships.map(async row => {
    const conversation = row.conversations;
    const peers = (conversation.conversation_participants || [])
      .filter(item => String(item.user_id) !== String(userId))
      .map(item => ({
        userId: item.users?.id || item.user_id,
        name: item.users?.name || "Unknown",
        phone: item.users?.phone || null
      }));
    const lastMessage = conversation.messages?.[0] || null;
    const unreadCount = await prisma.message_status.count({
      where: {
        user_id: BigInt(userId),
        NOT: { status: "READ" },
        messages: {
          conversation_id: conversation.id,
          sender_id: {
            not: BigInt(userId)
          }
        }
      }
    });

    return {
      id: conversation.id,
      type: conversation.type,
      created_at: conversation.created_at,
      peers,
      lastMessage,
      unreadCount
    };
  }));

  return rows
    .filter(row => {
      if (String(row.type || "").toUpperCase() === "GROUP") return true;
      const peerId = row?.peers?.[0]?.userId;
      return peerId ? acceptedContactIds.has(String(peerId)) : false;
    })
    .sort((a, b) => {
      const aTime = new Date(a?.lastMessage?.created_at || a.created_at || 0).getTime();
      const bTime = new Date(b?.lastMessage?.created_at || b.created_at || 0).getTime();
      return bTime - aTime;
    });
}

export async function createConversationByPhone({ creatorId, phone }) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new Error("phone is required");
  }

  const peer = await findUserByPhone(normalizedPhone, {
    id: true,
    name: true,
    phone: true
  });
  if (!peer) {
    throw new Error("No LifeHub account found for this phone number");
  }
  if (String(peer.id) === String(creatorId)) {
    throw new Error("Cannot create conversation with yourself");
  }

  const contactStatus = await getContactStatus(creatorId, peer.id);
  if (contactStatus !== CONTACT_ACCEPTED) {
    throw new Error("Send and accept a contact request before starting a direct chat");
  }

  return getOrCreateDirectConversationBetweenUsers(creatorId, peer.id);
}

export async function createGroupConversationByPhones({
  creatorId,
  phones = []
}) {
  const requestedPhones = [...new Set(phones.map(normalizePhone).filter(Boolean))];
  if (requestedPhones.length < 2) {
    throw new Error("At least 2 phone numbers are required for a group chat");
  }
  const normalizedPhones = buildPhoneCandidatePool(requestedPhones);

  const users = await prisma.users.findMany({
    where: {
      phone: { in: normalizedPhones },
      id: { not: BigInt(creatorId) }
    },
    select: { id: true, phone: true }
  });

  if (users.length < 2) {
    throw new Error("At least 2 registered contacts are required to create group chat");
  }

  const participantIds = users.map(user => String(user.id));
  return createConversation({
    creatorId,
    participantIds,
    type: "GROUP"
  });
}

export async function resolveContactsByPhones({ userId, phones = [] }) {
  const requestedPhones = [...new Set(phones.map(normalizePhone).filter(Boolean))].slice(0, 500);
  if (!requestedPhones.length) return [];
  const normalized = buildPhoneCandidatePool(requestedPhones);

  const users = await prisma.users.findMany({
    where: {
      phone: { in: normalized },
      id: { not: BigInt(userId) }
    },
    select: {
      id: true,
      name: true,
      phone: true
    }
  });

  const userByPhone = new Map(
    (users || []).map(user => [normalizePhone(user.phone), user])
  );
  const matchedUsers = [];
  const seenUserIds = new Set();

  for (const requestedPhone of requestedPhones) {
    const match = buildNormalizedPhoneCandidates(requestedPhone)
      .map(candidate => userByPhone.get(candidate))
      .find(Boolean);

    if (!match) continue;

    const userIdKey = String(match.id);
    if (seenUserIds.has(userIdKey)) continue;
    seenUserIds.add(userIdKey);
    matchedUsers.push(match);
  }

  const contacts = [];
  for (const user of matchedUsers) {
    contacts.push({
      ...user,
      contactStatus: await getContactStatus(userId, user.id)
    });
  }

  return contacts;
}

export async function listMessages({ conversationId, userId, limit = 50, beforeMessageId = null }) {
  await assertParticipant(conversationId, userId);

  const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const rows = await prisma.messages.findMany({
    where: {
      conversation_id: BigInt(conversationId),
      ...(beforeMessageId
        ? {
            id: {
              lt: BigInt(beforeMessageId)
            }
          }
        : {})
    },
    include: {
      message_attachments: true,
      message_status: {
        select: {
          user_id: true,
          status: true
        }
      }
    },
    orderBy: {
      created_at: "desc"
    },
    take: take + 1
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const messages = page.map(message => {
    const statuses = message.message_status || [];
    const others = statuses.filter(
      item => String(item.user_id) !== String(message.sender_id)
    );

    let deliveryStatus = "SENT";
    if (others.some(item => String(item.status || "").toUpperCase() === "READ")) {
      deliveryStatus = "READ";
    } else if (
      others.some(item => String(item.status || "").toUpperCase() === "DELIVERED")
    ) {
      deliveryStatus = "DELIVERED";
    }

    return {
      ...message,
      deliveryStatus
    };
  });

  return {
    messages,
    hasMore,
    nextCursor: page.length ? String(page[page.length - 1].id) : null
  };
}

export async function sendMessage({
  conversationId,
  senderId,
  content,
  messageType = "TEXT",
  attachments = [],
  encryptedPayload = null
}) {
  await assertParticipant(conversationId, senderId);
  await assertNotSpam(senderId);

  let effectiveContent = content;
  const normalizedType = String(messageType || "TEXT").toUpperCase();

  if (normalizedType === "E2EE") {
    assertEncryptedPayload(encryptedPayload);
    effectiveContent = JSON.stringify({
      ciphertext: encryptedPayload.ciphertext,
      iv: encryptedPayload.iv,
      alg: encryptedPayload.alg,
      keyId: encryptedPayload.keyId
    });
  } else {
    assertModerationSafe(content);
  }

  const message = await prisma.messages.create({
    data: {
      conversation_id: BigInt(conversationId),
      sender_id: BigInt(senderId),
      message_type: normalizedType,
      content: effectiveContent
    }
  });

  if (Array.isArray(attachments) && attachments.length) {
    const mapped = [];
    for (const attachment of attachments) {
      let fileUrl = attachment.fileUrl || null;
      let fileType = attachment.fileType || "file";
      let fileSize = attachment.fileSize ? BigInt(attachment.fileSize) : null;

      if (attachment.fileId) {
        const file = await prisma.files.findUnique({
          where: { id: BigInt(attachment.fileId) }
        });
        if (file) {
          fileUrl = cdnUrlFromStorage(file.storage_path);
          fileType = file.file_type || fileType;
          fileSize = file.file_size || fileSize;
        }
      }

      if (!fileUrl) continue;

      mapped.push({
        message_id: message.id,
        file_url: fileUrl,
        file_type: fileType,
        file_size: fileSize
      });
    }

    if (mapped.length) {
      await prisma.message_attachments.createMany({
        data: mapped
      });
    }
  }

  const payload = normalizeBigInt(message);
  const recipients = await getParticipantIds(conversationId);
  await prisma.message_status.createMany({
    data: recipients.map(userId => ({
      message_id: message.id,
      user_id: BigInt(userId),
      status: String(userId) === String(senderId) ? "READ" : "SENT"
    })),
    skipDuplicates: true
  });

  for (const userId of recipients) {
    emitToUser(userId, "chat:message.created", payload);
  }
  for (const userId of recipients) {
    if (String(userId) === String(senderId)) continue;
    await createNotification({
      userId,
      eventType: "CHAT.MESSAGE_RECEIVED",
      priority: "MEDIUM",
      payload: {
        conversationId: String(conversationId),
        messageId: String(message.id),
        senderId: String(senderId)
      },
      channels: ["IN_APP", "PUSH", "SMS"]
    });
  }
  eventBus.emit("CHAT.MESSAGE_CREATED", payload);

  // Chat command bridge to workflow event.
  if (normalizedType !== "E2EE" && String(content || "").trim().toUpperCase() === "JOB_DONE") {
    eventBus.emit("CHAT.WORKFLOW_COMMAND", {
      command: "JOB_DONE",
      conversationId: String(conversationId),
      senderId: String(senderId)
    });
  }

  return message;
}

export async function markConversationRead({ conversationId, userId, lastMessageId }) {
  await assertParticipant(conversationId, userId);

  const membership = await prisma.conversation_participants.findUnique({
    where: {
      conversation_id_user_id: {
        conversation_id: BigInt(conversationId),
        user_id: BigInt(userId)
      }
    }
  });

  const previous = membership?.last_read_message
    ? BigInt(membership.last_read_message)
    : 0n;
  const incoming = lastMessageId ? BigInt(lastMessageId) : previous;
  const effective = incoming > previous ? incoming : previous;

  await prisma.conversation_participants.update({
    where: {
      conversation_id_user_id: {
        conversation_id: BigInt(conversationId),
        user_id: BigInt(userId)
      }
    },
    data: {
      last_read_message: effective > 0n ? effective : null
    }
  });

  if (effective > 0n) {
    await prisma.message_status.updateMany({
      where: {
        user_id: BigInt(userId),
        message_id: {
          lte: effective
        }
      },
      data: {
        status: "READ",
        updated_at: new Date()
      }
    });
  }

  const recipients = await getParticipantIds(conversationId);
  const payload = {
    conversationId: String(conversationId),
    userId: String(userId),
    lastMessageId: effective > 0n ? String(effective) : null
  };

  for (const memberId of recipients) {
    emitToUser(memberId, "chat:read", payload);
  }
}

export async function markDelivered({ conversationId, userId, lastMessageId }) {
  await assertParticipant(conversationId, userId);

  await prisma.message_status.updateMany({
    where: {
      user_id: BigInt(userId),
      status: "SENT",
      message_id: {
        lte: BigInt(lastMessageId)
      }
    },
    data: {
      status: "DELIVERED",
      updated_at: new Date()
    }
  });

  const recipients = await getParticipantIds(conversationId);
  const payload = {
    conversationId: String(conversationId),
    userId: String(userId),
    lastMessageId: String(lastMessageId)
  };
  for (const memberId of recipients) {
    emitToUser(memberId, "chat:delivered", payload);
  }
}

export async function publishTyping({ conversationId, userId, isTyping }) {
  await assertParticipant(conversationId, userId);
  const recipients = await getParticipantIds(conversationId);
  for (const memberId of recipients) {
    if (String(memberId) === String(userId)) continue;
    emitToUser(memberId, "chat:typing", {
      conversationId: String(conversationId),
      userId: String(userId),
      isTyping: Boolean(isTyping)
    });
  }
}

export async function syncEvents({ userId, deviceId, cursor, limit }) {
  return replayOfflineEvents(userId, deviceId, { cursor, limit });
}

// ======= NEW STORIES LOGIC =======
const STORY_TABLE = "chat_stories";
let chatStoriesEnsured = false;

async function ensureChatStoriesTable() {
  if (chatStoriesEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${STORY_TABLE}" (
      "id" BIGSERIAL PRIMARY KEY,
      "user_id" BIGINT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "content" TEXT,
      "media_url" TEXT,
      "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expires_at" TIMESTAMP(6) NOT NULL
    )
  `);
  chatStoriesEnsured = true;
}

export async function createStory(userId, { content = "", mediaUrl = null }) {
  await ensureChatStoriesTable();
  const uid = String(BigInt(userId));
  
  // 24 hours from now
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  
  const c = content ? `'${content.replace(/'/g, "''")}'` : "NULL";
  const m = mediaUrl ? `'${mediaUrl.replace(/'/g, "''")}'` : "NULL";
  
  const res = await prisma.$queryRawUnsafe(`
    INSERT INTO "${STORY_TABLE}" ("user_id", "content", "media_url", "expires_at")
    VALUES (${uid}, ${c}, ${m}, '${expiresAt}')
    RETURNING "id", "user_id" AS "userId", "content", "media_url" AS "mediaUrl", "created_at" AS "createdAt"
  `);
  return res[0];
}

export async function listStories(userId) {
  await ensureChatStoriesTable();
  const uid = String(BigInt(userId));
  
  // First, gather all friends
  const friendsRows = await prisma.$queryRawUnsafe(`
    SELECT CASE WHEN "requester_user_id" = ${uid} THEN "addressee_user_id" ELSE "requester_user_id" END AS "contact_id"
    FROM "chat_contacts"
    WHERE ("requester_user_id" = ${uid} OR "addressee_user_id" = ${uid}) AND "status" = 'ACCEPTED'
  `);
  const friends = friendsRows.map(f => String(f.contact_id));
  friends.push(uid); // Include own stories

  if (friends.length === 0) return [];

  const inClause = friends.join(",");
  
  const stories = await prisma.$queryRawUnsafe(`
    SELECT 
      s."id", s."user_id" AS "userId", s."content", s."media_url" AS "mediaUrl", s."created_at" AS "createdAt",
      u."name", u."avatar_url" AS "avatarUrl"
    FROM "${STORY_TABLE}" s
    JOIN "users" u ON u."id" = s."user_id"
    WHERE s."user_id" IN (${inClause})
      AND s."expires_at" > CURRENT_TIMESTAMP
    ORDER BY s."created_at" DESC
  `);
  
  return stories.map(s => ({
    id: String(s.id),
    userId: String(s.userId),
    userName: s.name,
    userAvatar: s.avatarUrl,
    content: s.content,
    mediaUrl: s.mediaUrl,
    createdAt: s.createdAt
  }));
}
