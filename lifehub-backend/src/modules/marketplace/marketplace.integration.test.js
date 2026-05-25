import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// --- All mocks BEFORE dynamic imports ---
jest.unstable_mockModule('./marketplace.service.js', () => ({
  searchProviders: jest.fn(),
  getProviderById: jest.fn(),
  searchShops: jest.fn(),
  searchProductsNearby: jest.fn(),
  recommendProductsNearby: jest.fn(),
  listShopProducts: jest.fn(),
  createShopProduct: jest.fn(),
  updateShopProduct: jest.fn(),
  upsertShopInventoryItems: jest.fn(),
  createShopFeedback: jest.fn(),
  listShopFeedback: jest.fn(),
  updateShopLocation: jest.fn(),
  updateProviderLocation: jest.fn(),
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

describe('Marketplace API Integration Tests', () => {
  let app;
  let marketplaceService;

  beforeAll(async () => {
    marketplaceService = await import('./marketplace.service.js');
    const { default: routes } = await import('./marketplace.routes.js');
    app = express();
    app.use(express.json());
    app.use('/api/marketplace', routes);
  });

  beforeEach(() => jest.clearAllMocks());

  // ── SEARCH SHOPS ──────────────────────────────────────────────────────────────
  describe('GET /api/marketplace/shops/search', () => {
    it('TC-MKT-INT-01: should return list of nearby shops', async () => {
      const mockShops = [
        { id: '1', name: 'Fresh Mart', distanceKm: 0.5, rating: 4.5 },
        { id: '2', name: 'Daily Needs', distanceKm: 1.2, rating: 4.1 },
      ];
      marketplaceService.searchShops.mockResolvedValue(mockShops);

      const res = await request(app)
        .get('/api/marketplace/shops/search')
        .query({ lat: '28.6139', lng: '77.2090', radiusKm: '5' });

      expect(res.status).toBe(200);
      expect(res.body.shops).toHaveLength(2);
      expect(res.body.shops[0].name).toBe('Fresh Mart');
      expect(marketplaceService.searchShops).toHaveBeenCalledWith(
        expect.objectContaining({ lat: '28.6139', lng: '77.2090' })
      );
    });

    it('TC-MKT-INT-02: should return 400 if searchShops throws', async () => {
      marketplaceService.searchShops.mockRejectedValue(new Error('Location required'));

      const res = await request(app).get('/api/marketplace/shops/search');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Location required');
    });
  });

  // ── SEARCH PRODUCTS ───────────────────────────────────────────────────────────
  describe('GET /api/marketplace/products/search', () => {
    it('TC-MKT-INT-03: should return matching products for a query', async () => {
      const mockProducts = [
        { productId: '10', name: 'Basmati Rice 5kg', price: 350, rating: 4.8 },
        { productId: '11', name: 'Sona Masoori Rice 2kg', price: 120, rating: 4.2 },
      ];
      marketplaceService.searchProductsNearby.mockResolvedValue(mockProducts);

      const res = await request(app)
        .get('/api/marketplace/products/search')
        .query({ q: 'rice', lat: '28.6139', lng: '77.2090' });

      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(2);
      expect(res.body.products[0].name).toContain('Rice');
    });
  });

  // ── GET SHOP PRODUCTS ─────────────────────────────────────────────────────────
  describe('GET /api/marketplace/shops/:shopId/products', () => {
    it('TC-MKT-INT-04: should return products for a specific shop', async () => {
      const mockProducts = [
        { productId: '5', name: 'Amul Butter 500g', price: 85, availableQuantity: 20 },
      ];
      marketplaceService.listShopProducts.mockResolvedValue(mockProducts);

      const res = await request(app).get('/api/marketplace/shops/1/products');

      expect(res.status).toBe(200);
      expect(res.body.products[0].name).toBe('Amul Butter 500g');
      expect(marketplaceService.listShopProducts).toHaveBeenCalledWith(
        expect.objectContaining({ shopId: '1' })
      );
    });
  });

  // ── PRODUCT RECOMMENDATIONS ───────────────────────────────────────────────────
  describe('GET /api/marketplace/products/recommendations', () => {
    it('TC-MKT-INT-05: should return recommended products for a user', async () => {
      const mockRecs = [
        { productId: '20', name: 'Organic Honey', price: 299 },
        { productId: '21', name: 'Green Tea', price: 149 },
      ];
      marketplaceService.recommendProductsNearby.mockResolvedValue(mockRecs);

      const res = await request(app)
        .get('/api/marketplace/products/recommendations')
        .query({ lat: '28.6139', lng: '77.2090' });

      expect(res.status).toBe(200);
      expect(res.body.products.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── CREATE PRODUCT (Seller) ───────────────────────────────────────────────────
  describe('POST /api/marketplace/shops/:shopId/products', () => {
    it('TC-MKT-INT-06: should allow a seller to create a new product', async () => {
      const mockCreated = {
        productId: '99',
        name: 'New Product',
        price: 200,
        availableQuantity: 50,
      };
      marketplaceService.createShopProduct.mockResolvedValue(mockCreated);

      const res = await request(app)
        .post('/api/marketplace/shops/1/products')
        .send({ name: 'New Product', price: 200, quantity: 50, category: 'grocery' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('New Product');
    });

    it('TC-MKT-INT-07: should return 400 if product data is invalid', async () => {
      marketplaceService.createShopProduct.mockRejectedValue(new Error('Name is required'));

      const res = await request(app)
        .post('/api/marketplace/shops/1/products')
        .send({ price: 200 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Name is required');
    });
  });

  // ── SHOP FEEDBACK ─────────────────────────────────────────────────────────────
  describe('POST /api/marketplace/shops/:shopId/feedback', () => {
    it('TC-MKT-INT-08: should create feedback for a shop', async () => {
      const mockFeedback = { id: '1', rating: 5, comment: 'Excellent service!' };
      marketplaceService.createShopFeedback.mockResolvedValue(mockFeedback);

      const res = await request(app)
        .post('/api/marketplace/shops/1/feedback')
        .send({ rating: 5, comment: 'Excellent service!' });

      expect(res.status).toBe(201);
      expect(res.body.rating).toBe(5);
    });
  });

  // ── SEARCH PROVIDERS ──────────────────────────────────────────────────────────
  describe('GET /api/marketplace/providers/search', () => {
    it('TC-MKT-INT-09: should return service providers near location', async () => {
      const mockProviders = [
        { id: '1', name: 'Raj Plumbing', skill: 'plumber', rating: 4.7, distanceKm: 0.8 },
        { id: '2', name: 'Electric Solutions', skill: 'electrician', rating: 4.5, distanceKm: 1.5 },
      ];
      marketplaceService.searchProviders.mockResolvedValue(mockProviders);

      const res = await request(app)
        .get('/api/marketplace/providers/search')
        .query({ lat: '28.6139', lng: '77.2090', skill: 'plumber', radiusKm: '5' });

      expect(res.status).toBe(200);
      expect(res.body.providers).toHaveLength(2);
      expect(res.body.providers[0].skill).toBe('plumber');
    });
  });
});
