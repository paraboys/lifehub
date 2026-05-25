import { jest } from '@jest/globals';

const mockChatService = {
  createConversation: jest.fn(),
  listConversations: jest.fn(),
  sendMessage: jest.fn(),
  createStory: jest.fn(),
  listStories: jest.fn(),
  reactToMessage: jest.fn(),
  createConversationByPhone: jest.fn(),
  createGroupConversationByPhones: jest.fn(),
  resolveContactsByPhones: jest.fn(),
  listContactDirectory: jest.fn(),
  findUserByPhone: jest.fn(),
  requestContactByPhone: jest.fn(),
  respondToContactRequest: jest.fn(),
  listMessages: jest.fn(),
  markConversationRead: jest.fn(),
  markDelivered: jest.fn(),
  publishTyping: jest.fn(),
  syncEvents: jest.fn()
};

const mockSocketHub = {
  isUserOnline: jest.fn(),
  listOnlineUsers: jest.fn()
};

jest.unstable_mockModule('./chat.service.js', () => mockChatService);
jest.unstable_mockModule('../../common/realtime/socketHub.js', () => mockSocketHub);

describe('Chat Controller', () => {
  let chatController;
  let req;
  let res;

  beforeAll(async () => {
    chatController = await import('./chat.controller.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    req = { user: { id: 1 }, body: {}, params: {}, query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('createConversation', () => {
    it('should create a new conversation successfully', async () => {
      req.body = { participantIds: [2], type: 'DIRECT' };
      const mockConversation = { id: 1n, type: 'DIRECT', participants: [] };
      mockChatService.createConversation.mockResolvedValue(mockConversation);

      await chatController.createConversation(req, res);

      expect(mockChatService.createConversation).toHaveBeenCalledWith({
        creatorId: 1,
        participantIds: [2],
        type: 'DIRECT'
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
    });

    it('should return 400 on error', async () => {
      req.body = { participantIds: [2] };
      mockChatService.createConversation.mockRejectedValue(new Error('Invalid participants'));

      await chatController.createConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid participants' });
    });
  });

  describe('sendMessage', () => {
    it('should send a message successfully', async () => {
      req.params = { conversationId: 1 };
      req.body = { content: 'Hello', messageType: 'TEXT' };
      const mockMessage = { id: 1n, content: 'Hello' };
      mockChatService.sendMessage.mockResolvedValue(mockMessage);

      await chatController.sendMessage(req, res);

      expect(mockChatService.sendMessage).toHaveBeenCalledWith({
        conversationId: 1,
        senderId: 1,
        content: 'Hello',
        messageType: 'TEXT',
        attachments: [],
        encryptedPayload: null
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
    });
  });
});
