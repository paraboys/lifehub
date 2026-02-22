import prisma from "../../config/db.js";
import { emitToUser } from "../../common/realtime/socketHub.js";
import { eventBus } from "../../common/events/eventBus.js";
import { normalizeBigInt } from "../../common/utils/bigint.js";
import { replayOfflineEvents } from "../../common/realtime/offlineEvents.js";
import { createNotification } from "../notifications/notification.service.js";
import { createRedisClient } from "../../config/redis.js";

const redis = createRedisClient("chat-service");
const MAX_MESSAGES_PER_MIN = Number(process.env.CHAT_RATE_LIMIT_PER_MIN || 30);
const BLOCKED_WORDS = (process.env.CHAT_BLOCKED_WORDS || "abuse,scam,fraud")
  .split(",")
  .map(v => v.trim().toLowerCase())
  .filter(Boolean);

async function getParticipantIds(conversationId) {
  const participants = await prisma.conversation_participants.findMany({
    where: { conversation_id: BigInt(conversationId) },
    select: { user_id: true }
  });
  return participants.map(p => String(p.user_id));
}

function normalizePhone(phone) {
  return String(phone || "").trim();
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
  const key = `chat:rate:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }
  if (count > MAX_MESSAGES_PER_MIN) {
    throw new Error("Too many messages. Please slow down.");
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

export async function listConversations(userId) {
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

  return Promise.all(memberships.map(async row => {
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
}

export async function createConversationByPhone({ creatorId, phone }) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new Error("phone is required");
  }

  const peer = await prisma.users.findUnique({
    where: { phone: normalizedPhone }
  });
  if (!peer) {
    throw new Error("No LifeHub account found for this phone number");
  }
  if (String(peer.id) === String(creatorId)) {
    throw new Error("Cannot create conversation with yourself");
  }

  const candidateConversations = await prisma.conversations.findMany({
    where: {
      type: "DIRECT",
      conversation_participants: {
        some: { user_id: BigInt(creatorId) }
      },
      AND: [
        {
          conversation_participants: {
            some: { user_id: peer.id }
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

  const existing = candidateConversations.find(item => {
    const participants = item.conversation_participants || [];
    if (participants.length !== 2) return false;
    const ids = participants.map(p => String(p.user_id));
    return ids.includes(String(creatorId)) && ids.includes(String(peer.id));
  });
  if (existing) return existing;

  return createConversation({
    creatorId,
    participantIds: [String(peer.id)],
    type: "DIRECT"
  });
}

export async function createGroupConversationByPhones({
  creatorId,
  phones = []
}) {
  const normalizedPhones = [...new Set(phones.map(normalizePhone).filter(Boolean))];
  if (normalizedPhones.length < 2) {
    throw new Error("At least 2 phone numbers are required for a group chat");
  }

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
  const normalized = [...new Set(phones.map(normalizePhone).filter(Boolean))].slice(0, 500);
  if (!normalized.length) return [];

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

  return users;
}

export async function listMessages({ conversationId, userId, limit = 50 }) {
  await assertParticipant(conversationId, userId);

  const rows = await prisma.messages.findMany({
    where: {
      conversation_id: BigInt(conversationId)
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
    take: Math.min(Math.max(Number(limit) || 50, 1), 200)
  });

  return rows.map(message => {
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
