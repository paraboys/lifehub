import * as chatService from "./chat.service.js";
import { jsonSafe } from "../../common/utils/jsonSafe.js";
import { isUserOnline, listOnlineUsers } from "../../common/realtime/socketHub.js";

export async function createConversation(req, res) {
  try {
    const conversation = await chatService.createConversation({
      creatorId: req.user.id,
      participantIds: req.body.participantIds || [],
      type: req.body.type || "DIRECT"
    });
    res.status(201).json(jsonSafe(conversation));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function createConversationByPhone(req, res) {
  try {
    const conversation = await chatService.createConversationByPhone({
      creatorId: req.user.id,
      phone: req.body.phone
    });
    res.status(201).json(jsonSafe(conversation));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function createGroupConversationByPhones(req, res) {
  try {
    const conversation = await chatService.createGroupConversationByPhones({
      creatorId: req.user.id,
      phones: req.body.phones || []
    });
    res.status(201).json(jsonSafe(conversation));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function listConversations(req, res) {
  try {
    const rows = await chatService.listConversations(req.user.id);
    res.json(jsonSafe({ conversations: rows }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function resolveContacts(req, res) {
  try {
    const contacts = await chatService.resolveContactsByPhones({
      userId: req.user.id,
      phones: req.body.phones || []
    });
    res.json(jsonSafe({ contacts }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function listMessages(req, res) {
  try {
    const messages = await chatService.listMessages({
      conversationId: req.params.conversationId,
      userId: req.user.id,
      limit: req.query.limit
    });
    res.json(jsonSafe({ messages }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function sendMessage(req, res) {
  try {
    const message = await chatService.sendMessage({
      conversationId: req.params.conversationId,
      senderId: req.user.id,
      content: req.body.content,
      messageType: req.body.messageType || "TEXT",
      attachments: req.body.attachments || [],
      encryptedPayload: req.body.encryptedPayload || null
    });
    res.status(201).json(jsonSafe(message));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function markRead(req, res) {
  try {
    await chatService.markConversationRead({
      conversationId: req.params.conversationId,
      userId: req.user.id,
      lastMessageId: req.body.lastMessageId
    });
    res.json({ message: "Read state updated" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function markDelivered(req, res) {
  try {
    await chatService.markDelivered({
      conversationId: req.params.conversationId,
      userId: req.user.id,
      lastMessageId: req.body.lastMessageId
    });
    res.json({ message: "Delivered state updated" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function typing(req, res) {
  try {
    await chatService.publishTyping({
      conversationId: req.params.conversationId,
      userId: req.user.id,
      isTyping: req.body.isTyping
    });
    res.json({ message: "Typing state emitted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function presence(req, res) {
  const userId = req.params.userId || req.user.id;
  res.json({
    userId: String(userId),
    online: isUserOnline(userId)
  });
}

export async function presenceList(_, res) {
  res.json(jsonSafe({ users: listOnlineUsers() }));
}

export async function sync(req, res) {
  try {
    const data = await chatService.syncEvents({
      userId: req.user.id,
      deviceId: req.deviceId || "unknown-device",
      cursor: req.query.cursor,
      limit: req.query.limit
    });
    res.json(jsonSafe(data));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
