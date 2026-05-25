import { jest } from '@jest/globals';

const mockPaymentService = {
  createPaymentIntent: jest.fn(),
  getPaymentIntent: jest.fn(),
  confirmPaymentIntent: jest.fn(),
  processWebhook: jest.fn()
};

jest.unstable_mockModule('./payment.service.js', () => mockPaymentService);

describe('Payment Controller', () => {
  let controller;
  let req;
  let res;

  beforeAll(async () => {
    controller = await import('./payment.controller.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    req = { user: { id: 1 }, body: {}, params: {}, query: {}, headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('createIntent', () => {
    it('should create a payment intent successfully', async () => {
      req.body = { amount: 500, purpose: 'ORDER', currency: 'INR' };
      const mockIntent = { id: 'pi_123', amount: 500 };
      
      mockPaymentService.createPaymentIntent.mockResolvedValue(mockIntent);

      await controller.createIntent(req, res);

      expect(mockPaymentService.createPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
        userId: 1,
        amount: 500,
        purpose: 'ORDER'
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockIntent);
    });

    it('should handle errors in intent creation', async () => {
      mockPaymentService.createPaymentIntent.mockRejectedValue(new Error('Gateway error'));

      await controller.createIntent(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Gateway error' });
    });
  });

  describe('confirmIntent', () => {
    it('should confirm payment intent successfully', async () => {
      req.params = { intentId: 'pi_123' };
      req.body = { providerIntentId: 'ext_123' };
      const mockResult = { status: 'CONFIRMED' };
      
      mockPaymentService.confirmPaymentIntent.mockResolvedValue(mockResult);

      await controller.confirmIntent(req, res);

      expect(mockPaymentService.confirmPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
        intentId: 'pi_123',
        userId: 1,
        providerIntentId: 'ext_123'
      }));
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });
  });
});
