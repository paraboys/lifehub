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

export async function createShopProduct(req, res) {
  try {
    const product = await marketplaceService.createShopProduct({
      actorUserId: req.user.id,
      actorRoles: req.user.roles || [],
      shopId: req.params.shopId,
      name: req.body.name,
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
      name: req.body.name,
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
