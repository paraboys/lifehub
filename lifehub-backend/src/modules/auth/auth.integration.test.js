import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
// Mock dependencies
const mockAuthService = {
  loginWithPassword: jest.fn(),
  loginUser: jest.fn(),
  signup: jest.fn(),
};
jest.unstable_mockModule('./auth.service.js', () => mockAuthService);
jest.unstable_mockModule('../../common/middlewares/rateLimiter.js', () => ({
  authLimiter: (req, res, next) => next(),
}));
jest.unstable_mockModule('../../common/security/abuseGuard.js', () => ({
  abuseGuard: () => (req, res, next) => next(),
}));

describe('Auth API Integration', () => {
  let app;

  beforeAll(async () => {
    // We dynamically import the routes *after* mocking the service
    const { default: routes } = await import('./auth.routes.js');
    app = express();
    app.use(express.json());
    app.use('/api/auth', routes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /api/auth/login should return 200 with valid credentials', async () => {
    const mockToken = { accessToken: 'access', refreshToken: 'refresh', user: { id: 1, phone: '1234567890', name: 'Test', user_roles: [] } };
    mockAuthService.loginUser.mockResolvedValue(mockToken);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ phone: '1234567890', password: 'password123' });

    expect(res.status).toBe(200);
    // User response formatting from controller:
    expect(res.body.accessToken).toBe('access');
    expect(mockAuthService.loginUser).toHaveBeenCalled();
  });

  it('POST /api/auth/login should return 401 with invalid credentials', async () => {
    mockAuthService.loginUser.mockRejectedValue(new Error('Invalid credentials'));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ phone: '1234567890', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });
});
