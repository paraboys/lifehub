import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// --- All mocks BEFORE dynamic imports ---
jest.unstable_mockModule('./payment.service.js', () => ({
  createPaymentIntent: jest.fn(),
  getPaymentIntent: jest.fn(),
  confirmPaymentIntent: jest.fn(),
  processWebhook: jest.fn(),
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

describe('Payments API Integration Tests', () => {
  let app;
  let paymentService;

  beforeAll(async () => {
    paymentService = await import('./payment.service.js');
    const { default: routes } = await import('./payment.routes.js');
    app = express();
    app.use(express.json());
    app.use('/api/payments', routes);
  });

  beforeEach(() => jest.clearAllMocks());

  // ── CREATE INTENT ─────────────────────────────────────────────────────────────
  describe('POST /api/payments/intents', () => {
    it('TC-PAY-INT-01: should create a payment intent and return 201', async () => {
      const mockIntent = {
        id: 'pi_test_001',
        userId: '1',
        amount: 500,
        currency: 'INR',
        status: 'PENDING',
        provider: 'RAZORPAY',
      };
      paymentService.createPaymentIntent.mockResolvedValue(mockIntent);

      const res = await request(app)
        .post('/api/payments/intents')
        .send({ amount: 500, currency: 'INR', purpose: 'ORDER', provider: 'RAZORPAY' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 'pi_test_001', amount: 500, status: 'PENDING' });
      expect(paymentService.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 500, purpose: 'ORDER' })
      );
    });

    it('TC-PAY-INT-02: should return 400 if amount is invalid', async () => {
      paymentService.createPaymentIntent.mockRejectedValue(new Error('Amount must be positive'));

      const res = await request(app)
        .post('/api/payments/intents')
        .send({ amount: -100, currency: 'INR' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Amount must be positive');
    });
  });

  // ── GET INTENT ────────────────────────────────────────────────────────────────
  describe('GET /api/payments/intents/:intentId', () => {
    it('TC-PAY-INT-03: should return a payment intent for the authenticated user', async () => {
      const mockIntent = { id: 'pi_test_001', userId: BigInt(1), amount: 500, status: 'PENDING' };
      paymentService.getPaymentIntent.mockResolvedValue(mockIntent);

      const res = await request(app).get('/api/payments/intents/pi_test_001');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('pi_test_001');
    });

    it('TC-PAY-INT-04: should return 404 if intent belongs to a different user', async () => {
      // userId is BigInt(99) - different from authenticated user BigInt(1)
      paymentService.getPaymentIntent.mockResolvedValue({
        id: 'pi_other', userId: BigInt(99), amount: 100, status: 'PENDING'
      });

      const res = await request(app).get('/api/payments/intents/pi_other');
      expect(res.status).toBe(404);
    });
  });

  // ── CONFIRM INTENT ────────────────────────────────────────────────────────────
  describe('POST /api/payments/intents/:intentId/confirm', () => {
    it('TC-PAY-INT-05: should confirm a payment intent successfully', async () => {
      const mockConfirmed = { id: 'pi_test_001', status: 'COMPLETED' };
      paymentService.confirmPaymentIntent.mockResolvedValue(mockConfirmed);

      const res = await request(app)
        .post('/api/payments/intents/pi_test_001/confirm')
        .send({
          providerIntentId: 'razorpay_order_abc',
          providerPaymentId: 'razorpay_pay_xyz',
          signature: 'valid_sig_hash',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
    });

    it('TC-PAY-INT-06: should return 400 on invalid signature', async () => {
      paymentService.confirmPaymentIntent.mockRejectedValue(new Error('Invalid signature'));

      const res = await request(app)
        .post('/api/payments/intents/pi_test_001/confirm')
        .send({ providerIntentId: 'x', providerPaymentId: 'y', signature: 'bad' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid signature');
    });
  });

  // ── WEBHOOK ───────────────────────────────────────────────────────────────────
  describe('POST /api/payments/webhooks/:provider', () => {
    it('TC-PAY-INT-07: should process a Razorpay webhook successfully', async () => {
      paymentService.processWebhook.mockResolvedValue({ processed: true });

      const res = await request(app)
        .post('/api/payments/webhooks/razorpay')
        .set('x-razorpay-signature', 'mock_sig')
        .send({ event: 'payment.captured', payload: {} });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.processed).toBe(true);
    });

    it('TC-PAY-INT-08: should return 400 on malformed webhook', async () => {
      paymentService.processWebhook.mockRejectedValue(new Error('Webhook verification failed'));

      const res = await request(app)
        .post('/api/payments/webhooks/razorpay')
        .send({ bad: 'data' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Webhook verification failed');
    });
  });
});
