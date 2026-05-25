import { jest } from '@jest/globals';

// Mock the db
const prismaMock = {
  $executeRawUnsafe: jest.fn(),
  users: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  roles: {
    findFirst: jest.fn(),
  },
  user_sessions: {
    create: jest.fn()
  }
};

jest.unstable_mockModule('../../config/db.js', () => ({
  default: prismaMock
}));

// Mock authUtils
jest.unstable_mockModule('../../common/authUtils.js', () => ({
  hashPassword: jest.fn(),
  comparePassword: jest.fn(),
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn()
}));

// Mock otp.service.js
jest.unstable_mockModule('./otp.service.js', () => ({
  buildPhoneCandidates: jest.fn((phone) => [phone])
}));

describe('Auth Service', () => {
  let authService;
  
  beforeAll(async () => {
    authService = await import('./auth.service.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('signupUser', () => {
    it('should successfully sign up a new user', async () => {
      const mockData = {
        name: 'Test User',
        phone: '1234567890',
        email: 'test@example.com',
        password: 'password123',
        role: 'CUSTOMER'
      };

      prismaMock.users.findFirst.mockResolvedValue(null);
      prismaMock.roles.findFirst.mockResolvedValue({ id: 1, role_name: 'customer' });
      
      const { hashPassword } = await import('../../common/authUtils.js');
      hashPassword.mockResolvedValue('hashedPassword');
      
      prismaMock.users.create.mockResolvedValue({
        id: 1,
        name: mockData.name,
        phone: mockData.phone,
        email: mockData.email
      });

      const user = await authService.signupUser(mockData);

      expect(user).toBeDefined();
      expect(user.phone).toBe(mockData.phone);
      expect(prismaMock.users.findFirst).toHaveBeenCalledTimes(1);
      expect(prismaMock.users.create).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if user already exists', async () => {
      const mockData = { phone: '1234567890', password: 'password123' };
      prismaMock.users.findFirst.mockResolvedValue({ id: 1, phone: mockData.phone });

      await expect(authService.signupUser(mockData)).rejects.toThrow('User already exists');
    });

    it('should throw an error if password is too short', async () => {
      const mockData = { phone: '1234567890', password: '123' };
      await expect(authService.signupUser(mockData)).rejects.toThrow('Password must be at least 6 characters');
    });
  });
});
