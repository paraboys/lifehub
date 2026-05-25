import { jest } from '@jest/globals';

const mockOrderService = {
  createOrder: jest.fn(),
  listOrders: jest.fn(),
  getOrderById: jest.fn(),
  cancelOrder: jest.fn(),
  startOrderDelivery: jest.fn(),
  issueDeliveryOtp: jest.fn(),
  confirmDelivery: jest.fn(),
  generateInvoice: jest.fn()
};

jest.unstable_mockModule('./order.service.js', () => mockOrderService);

describe('Order Controller', () => {
  let controller;
  let req;
  let res;

  beforeAll(async () => {
    controller = await import('./order.controller.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    req = { user: { id: 1, roles: [] }, body: {}, params: {}, query: {}, headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false
    };
  });

  describe('createOrder', () => {
    it('should create an order successfully', async () => {
      req.body = { shopId: 10, total: 100, items: [] };
      const mockPayload = { order: { id: 1 }, paymentIntent: {} };
      
      mockOrderService.createOrder.mockResolvedValue(mockPayload);

      await controller.createOrder(req, res);

      expect(mockOrderService.createOrder).toHaveBeenCalledWith(expect.objectContaining({
        userId: 1,
        shopId: 10,
        total: 100
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockPayload);
    });

    it('should return 400 on error', async () => {
      req.body = { shopId: 10 };
      mockOrderService.createOrder.mockRejectedValue(new Error('Invalid order'));

      await controller.createOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid order' });
    });
  });

  describe('listOrders', () => {
    it('should list orders', async () => {
      req.query = { limit: '10' };
      const mockOrders = [{ id: 1 }, { id: 2 }];
      mockOrderService.listOrders.mockResolvedValue(mockOrders);

      await controller.listOrders(req, res);

      expect(mockOrderService.listOrders).toHaveBeenCalledWith(expect.objectContaining({
        userId: 1,
        limit: '10'
      }));
      expect(res.json).toHaveBeenCalledWith({ orders: mockOrders });
    });
  });
});
