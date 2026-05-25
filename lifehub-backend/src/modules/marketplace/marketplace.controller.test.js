import { jest } from '@jest/globals';

const mockMarketplaceService = {
  searchProviders: jest.fn(),
  getProviderById: jest.fn(),
  searchShops: jest.fn(),
  listShopProducts: jest.fn(),
  searchProductsNearby: jest.fn(),
  recommendProductsNearby: jest.fn(),
  createShopProduct: jest.fn(),
  updateShopProduct: jest.fn(),
  updateShopLocation: jest.fn(),
  updateProviderLocation: jest.fn(),
  upsertShopInventoryItems: jest.fn(),
  createShopFeedback: jest.fn(),
  listShopFeedback: jest.fn()
};

jest.unstable_mockModule('./marketplace.service.js', () => mockMarketplaceService);

describe('Marketplace Controller', () => {
  let controller;
  let req;
  let res;

  beforeAll(async () => {
    controller = await import('./marketplace.controller.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    req = { user: { id: 1, roles: [] }, body: {}, params: {}, query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('searchProviders', () => {
    it('should search providers and return results', async () => {
      req.query = { skill: 'plumbing', limit: '10' };
      const mockProviders = [{ id: 1, name: 'Provider 1' }];
      mockMarketplaceService.searchProviders.mockResolvedValue(mockProviders);

      await controller.searchProviders(req, res);

      expect(mockMarketplaceService.searchProviders).toHaveBeenCalledWith(expect.objectContaining({
        skill: 'plumbing',
        limit: '10'
      }));
      expect(res.json).toHaveBeenCalledWith({ providers: mockProviders });
    });
  });

  describe('createShopProduct', () => {
    it('should create a shop product', async () => {
      req.params = { shopId: '10' };
      req.body = { name: 'Apples', price: 5.99 };
      const mockProduct = { id: 1, name: 'Apples', price: 5.99 };
      
      mockMarketplaceService.createShopProduct.mockResolvedValue(mockProduct);

      await controller.createShopProduct(req, res);

      expect(mockMarketplaceService.createShopProduct).toHaveBeenCalledWith(expect.objectContaining({
        shopId: '10',
        name: 'Apples',
        price: 5.99
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockProduct);
    });

    it('should handle errors', async () => {
      req.params = { shopId: '10' };
      mockMarketplaceService.createShopProduct.mockRejectedValue(new Error('Invalid data'));

      await controller.createShopProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid data' });
    });
  });
});
