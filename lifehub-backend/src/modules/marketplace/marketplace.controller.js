import * as marketplaceService from "./marketplace.service.js";
import { jsonSafe } from "../../common/utils/jsonSafe.js";

export async function searchProviders(req, res) {
  try {
    const providers = await marketplaceService.searchProviders({
      skill: req.query.skill,
      availableOnly: req.query.availableOnly !== "false",
      minRating: req.query.minRating ? Number(req.query.minRating) : undefined,
      lat: req.query.lat,
      lng: req.query.lng,
      radiusKm: req.query.radiusKm,
      limit: req.query.limit
    });
    res.json(jsonSafe({ providers }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getProvider(req, res) {
  try {
    const provider = await marketplaceService.getProviderById(req.params.providerId);
    res.json(jsonSafe(provider));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
}

export async function searchShops(req, res) {
  try {
    const shops = await marketplaceService.searchShops({
      availableOnly: req.query.availableOnly !== "false",
      minRating: req.query.minRating ? Number(req.query.minRating) : undefined,
      lat: req.query.lat,
      lng: req.query.lng,
      sortBy: req.query.sortBy,
      radiusKm: req.query.radiusKm,
      limit: req.query.limit
    });
    res.json(jsonSafe({ shops }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getShopProducts(req, res) {
  try {
    const products = await marketplaceService.listShopProducts({
      shopId: req.params.shopId,
      category: req.query.category,
      query: req.query.query,
      limit: req.query.limit
    });
    res.json(jsonSafe({ products }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function searchProducts(req, res) {
  try {
    const products = await marketplaceService.searchProductsNearby({
      query: req.query.query,
      lat: req.query.lat,
      lng: req.query.lng,
      maxPrice: req.query.maxPrice,
      minShopRating: req.query.minShopRating,
      sortBy: req.query.sortBy,
      radiusKm: req.query.radiusKm,
      limit: req.query.limit
    });
    res.json(jsonSafe({ products }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function recommendProducts(req, res) {
  try {
    const products = await marketplaceService.recommendProductsNearby({
      lat: req.query.lat,
      lng: req.query.lng,
      radiusKm: req.query.radiusKm,
      maxPrice: req.query.maxPrice,
      minShopRating: req.query.minShopRating,
      seedProductIds: req.query.seedProductIds,
      query: req.query.query,
      limit: req.query.limit
    });
    res.json(jsonSafe({ products }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function createShopProduct(req, res) {
  try {
    const product = await marketplaceService.createShopProduct({
      actorUserId: req.user.id,
      actorRoles: req.user.roles || [],
      shopId: req.params.shopId,
      name: req.body.name,
      company: req.body.company,
      description: req.body.description,
      imageUrl: req.body.imageUrl,
      price: req.body.price,
      category: req.body.category,
      quantity: req.body.quantity
    });
    res.status(201).json(jsonSafe(product));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateShopProduct(req, res) {
  try {
    const product = await marketplaceService.updateShopProduct({
      actorUserId: req.user.id,
      actorRoles: req.user.roles || [],
      productId: req.params.productId,
      shopId: req.body.shopId,
      name: req.body.name,
      company: req.body.company,
      description: req.body.description,
      imageUrl: req.body.imageUrl,
      price: req.body.price,
      category: req.body.category,
      quantity: req.body.quantity
    });
    res.json(jsonSafe(product));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateShopLocation(req, res) {
  try {
    const row = await marketplaceService.updateShopLocation({
      actorUserId: req.user.id,
      actorRoles: req.user.roles || [],
      shopId: req.params.shopId,
      lat: req.body.lat,
      lng: req.body.lng
    });
    res.json(jsonSafe(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateProviderLocation(req, res) {
  try {
    const row = await marketplaceService.updateProviderLocation({
      actorUserId: req.user.id,
      actorRoles: req.user.roles || [],
      providerId: req.params.providerId,
      lat: req.body.lat,
      lng: req.body.lng,
      available: req.body.available
    });
    res.json(jsonSafe(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function upsertShopInventory(req, res) {
  try {
    const products = await marketplaceService.upsertShopInventoryItems({
      actorUserId: req.user.id,
      actorRoles: req.user.roles || [],
      shopId: req.params.shopId,
      items: req.body.items || []
    });
    res.status(201).json(jsonSafe({ products }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function createShopFeedback(req, res) {
  try {
    const payload = await marketplaceService.createShopFeedback({
      actorUserId: req.user.id,
      shopId: req.params.shopId,
      rating: req.body.rating,
      comment: req.body.comment,
      orderId: req.body.orderId
    });
    res.status(201).json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getShopFeedback(req, res) {
  try {
    const payload = await marketplaceService.listShopFeedback({
      shopId: req.params.shopId,
      limit: req.query.limit
    });
    res.json(jsonSafe(payload));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
