import { jest } from '@jest/globals';

const prismaMock = {
  users: {
    findUnique: jest.fn(),
    update: jest.fn(),
  }
};

jest.unstable_mockModule('../../config/db.js', () => ({
  default: prismaMock
}));

const mockSettingsStore = {
  getUserSettings: jest.fn(),
  setUserSettings: jest.fn()
};

jest.unstable_mockModule('./user.settings.store.js', () => mockSettingsStore);

describe('User Controller', () => {
  let userController;
  let req;
  let res;

  beforeAll(async () => {
    userController = await import('./user.controller.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    req = { user: { id: 1 }, body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('getProfile', () => {
    it('should return user profile successfully', async () => {
      const mockUser = {
        id: 1n,
        name: 'Test User',
        phone: '1234567890',
        email: 'test@example.com',
        user_roles: [{ roles: { role_name: 'customer' } }]
      };
      
      prismaMock.users.findUnique.mockResolvedValue(mockUser);

      await userController.getProfile(req, res);

      expect(prismaMock.users.findUnique).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Test User',
        roles: ['CUSTOMER']
      }));
    });

    it('should return 404 if user not found', async () => {
      prismaMock.users.findUnique.mockResolvedValue(null);

      await userController.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });
  });

  describe('updateProfile', () => {
    it('should update user profile successfully', async () => {
      req.body = { name: 'New Name', email: 'new@example.com' };
      const mockUpdatedUser = {
        id: 1n,
        name: 'New Name',
        email: 'new@example.com',
        user_roles: []
      };

      prismaMock.users.update.mockResolvedValue(mockUpdatedUser);

      await userController.updateProfile(req, res);

      expect(prismaMock.users.update).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Name',
        email: 'new@example.com'
      }));
    });

    it('should return 400 if name is missing', async () => {
      req.body = { email: 'new@example.com' };

      await userController.updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.any(String)
      }));
    });
  });
});
