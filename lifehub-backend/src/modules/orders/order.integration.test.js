import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// --- Mocks must come before any imports that pull in those modules ---
jest.unstable_mockModule('./order.service.js', () => ({
  createOrder: jest.fn(),
  listOrders: jest.fn(),
  getOrderById: jest.fn(),
  cancelOrder: jest.fn(),
  startOrderDelivery: jest.fn(),
  issueDeliveryOtp: jest.fn(),
  confirmDelivery: jest.fn(),
  generateInvoice: jest.fn(),
}));
jest.unstable_mockModule('../../common/middlewares/auth.middleware.js', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: BigInt(1), roles: ['CUSTOMER'] };
    next();
  },
}));
jest.unstable_mockModule('../../common/middlewares/role.middleware.js', () => ({
  authorize: (...roles) => (req, res, next) => next(),
}));
jest.unstable_mockModule('../../common/security/abuseGuard.js', () => ({
  abuseGuard: () => (req, res, next) => next(),
}));
jest.unstable_mockModule('../../common/utils/jsonSafe.js', () => ({
  jsonSafe: (data) => JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  )),
}));

describe('Orders API Integration Tests', () => {
  let app;
  let orderService;

  beforeAll(async () => {
    orderService = await import('./order.service.js');
    const { default: routes } = await import('./order.routes.js');
    app = express();
    app.use(express.json());
    app.use('/api/orders', routes);
  });

  beforeEach(() => jest.clearAllMocks());

  // ── CREATE ORDER ──────────────────────────────────────────────────────────────
  describe('POST /api/orders', () => {
    it('TC-ORD-INT-01: should create an order and return 201', async () => {
      const mockOrder = { id: '1', status: 'PENDING', total: 250 };
      orderService.createOrder.mockResolvedValue(mockOrder);

      const res = await request(app)
        .post('/api/orders')
        .send({ shopId: '5', total: 250, items: [{ productId: '10', quantity: 2, price: 125 }] });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: '1', status: 'PENDING' });
      expect(orderService.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ shopId: '5', total: 250 })
      );
    });

    it('TC-ORD-INT-02: should return 400 if order creation fails', async () => {
      orderService.createOrder.mockRejectedValue(new Error('Insufficient stock'));

      const res = await request(app)
        .post('/api/orders')
        .send({ shopId: '5', total: 250, items: [] });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Insufficient stock' });
    });
  });

  // ── LIST ORDERS ───────────────────────────────────────────────────────────────
  describe('GET /api/orders', () => {
    it('TC-ORD-INT-03: should list orders for user', async () => {
      const mockOrders = [{ id: '1', status: 'DELIVERED' }, { id: '2', status: 'PENDING' }];
      orderService.listOrders.mockResolvedValue(mockOrders);

      const res = await request(app).get('/api/orders');

      expect(res.status).toBe(200);
      expect(res.body.orders).toHaveLength(2);
    });
  });

  // ── GET SINGLE ORDER ──────────────────────────────────────────────────────────
  describe('GET /api/orders/:orderId', () => {
    it('TC-ORD-INT-04: should return a specific order', async () => {
      const mockOrder = { id: '42', status: 'CONFIRMED', total: 500 };
      orderService.getOrderById.mockResolvedValue(mockOrder);

      const res = await request(app).get('/api/orders/42');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: '42' });
    });

    it('TC-ORD-INT-05: should return 404 if order not found', async () => {
      orderService.getOrderById.mockRejectedValue(new Error('Order not found'));

      const res = await request(app).get('/api/orders/999');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Order not found' });
    });
  });

  // ── CANCEL ORDER ──────────────────────────────────────────────────────────────
  describe('POST /api/orders/:orderId/cancel', () => {
    it('TC-ORD-INT-06: should cancel an order', async () => {
      const mockUpdated = { id: '1', status: 'CANCELLED' };
      orderService.cancelOrder.mockResolvedValue(mockUpdated);

      const res = await request(app)
        .post('/api/orders/1/cancel')
        .send({ reason: 'Changed my mind' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
    });
  });

  // ── CONFIRM DELIVERY ──────────────────────────────────────────────────────────
  describe('POST /api/orders/:orderId/delivery/confirm', () => {
    it('TC-ORD-INT-07: should confirm delivery with valid OTP', async () => {
      const mockConfirmed = { id: '1', status: 'DELIVERED' };
      orderService.confirmDelivery.mockResolvedValue(mockConfirmed);

      const res = await request(app)
        .post('/api/orders/1/delivery/confirm')
        .send({ otp: '123456', rating: 5, feedback: 'Great!' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('DELIVERED');
    });

    it('TC-ORD-INT-08: should return 400 on invalid OTP', async () => {
      orderService.confirmDelivery.mockRejectedValue(new Error('Invalid OTP'));

      const res = await request(app)
        .post('/api/orders/1/delivery/confirm')
        .send({ otp: 'wrong' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid OTP');
    });
  });

  // ── GENERATE INVOICE ──────────────────────────────────────────────────────────
  describe('POST /api/orders/:orderId/invoice', () => {
    it('TC-ORD-INT-09: should generate and return invoice', async () => {
      const mockInvoice = { invoiceNumber: 'INV-0042', total: 500, items: [] };
      orderService.generateInvoice.mockResolvedValue(mockInvoice);

      const res = await request(app).post('/api/orders/42/invoice');

      expect(res.status).toBe(200);
      expect(res.body.invoiceNumber).toBe('INV-0042');
    });
  });
});
