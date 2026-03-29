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

export async function listContactDirectory(req, res) {
  try {
    const payload = await chatService.listContactDirectory(req.user.id);
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function requestContact(req, res) {
  try {
    const payload = await chatService.requestContactByPhone({
      requesterId: req.user.id,
      phone: req.body.phone
    });
    res.status(201).json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function respondContactRequest(req, res) {
  try {
    const payload = await chatService.respondToContactRequest({
      requestId: req.params.requestId,
      userId: req.user.id,
      action: req.body.action
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function listMessages(req, res) {
  try {
    const payload = await chatService.listMessages({
      conversationId: req.params.conversationId,
      userId: req.user.id,
      limit: req.query.limit,
      beforeMessageId: req.query.beforeMessageId
    });
    res.json(jsonSafe(payload));
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

import { createStory as svcCreateStory, listStories as svcListStories } from "./chat.service.js";

export const createStory = async (req, res, next) => {
  try {
    const story = await svcCreateStory(req.user.id, req.body);
    res.status(201).json({ success: true, story });
  } catch (error) {
    next(error);
  }
};

export const listStories = async (req, res, next) => {
  try {
    const stories = await svcListStories(req.user.id);
    res.json({ success: true, stories });
  } catch (error) {
    next(error);
  }
}

export async function reactMessage(req, res) {
  try {
    const updated = await chatService.reactToMessage({
      messageId: req.params.messageId,
      userId: req.user.id,
      emoji: req.body.emoji
    });
    res.json({ success: true, reactions: updated.reactions });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
